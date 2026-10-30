import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type ApplyClassLessonParams = {
  classId: string;
};

export async function applyClassLessonToPresentStudents({
  classId,
}: ApplyClassLessonParams) {
  const classRef = doc(
    db,
    "classes",
    classId
  );

  const classSnapshot =
    await getDoc(classRef);

  if (!classSnapshot.exists()) {
    throw new Error("找不到課程資料");
  }

  const classData =
    classSnapshot.data();

  const lessonContent =
    String(
      classData.lessonContent ?? ""
    ).trim();

  if (!lessonContent) {
    throw new Error(
      "這堂課尚未填寫上課內容"
    );
  }

  if (
    !(
      classData.startTime instanceof
      Timestamp
    )
  ) {
    throw new Error(
      "課程時間資料不正確"
    );
  }

  const bookingsQuery = query(
    collection(db, "bookings"),
    where("classId", "==", classId),
    where(
      "attendanceStatus",
      "==",
      "present"
    )
  );

  const bookingsSnapshot =
    await getDocs(bookingsQuery);

  if (bookingsSnapshot.empty) {
    throw new Error(
      "目前沒有已點名為「已到」的學生"
    );
  }

  let createdCount = 0;

  for (
    const bookingDocument of
      bookingsSnapshot.docs
  ) {
    const bookingData =
      bookingDocument.data();

    const studentId =
      String(
        bookingData.userId ?? ""
      );

    if (!studentId) {
      continue;
    }

    // 固定 ID：
    // 同一學生＋同一堂課只會有一筆
    const recordId =
      `${studentId}_${classId}`;

    const recordRef = doc(
      db,
      "studentLessonRecords",
      recordId
    );

    await setDoc(
      recordRef,
      {
        studentId,
        classId,

        bookingId:
          bookingDocument.id,

        courseName:
          String(
            classData.courseName ?? ""
          ),

        classStartTime:
          classData.startTime,

        lessonContent,

        source: "class",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    createdCount += 1;
  }

  return {
    createdCount,
    lessonContent,
  };
}