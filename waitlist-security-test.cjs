const fs = require("node:fs");

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");

const {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} = require("firebase/firestore");

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-naya-aerial",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync("firestore.safe.rules", "utf8")
    }
  });

  try {
    const uid = "waitlist-test-student";
    const otherUid = "waitlist-test-other";
    const fullClassId = "waitlist-test-full";
    const openClassId = "waitlist-test-open";

    const startTime = Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await setDoc(doc(db, "users", uid), {
        uid,
        role: "student",
        points: 10,
        rewardPoints: 0
      });

      await setDoc(doc(db, "users", otherUid), {
        uid: otherUid,
        role: "student",
        points: 10,
        rewardPoints: 0
      });

      await setDoc(doc(db, "classes", fullClassId), {
        courseName: "候補測試滿班課程",
        startTime,
        status: "open",
        capacity: 6,
        bookedCount: 6,
        pointsRequired: 1
      });

      await setDoc(doc(db, "classes", openClassId), {
        courseName: "候補測試未滿班課程",
        startTime,
        status: "open",
        capacity: 6,
        bookedCount: 5,
        pointsRequired: 1
      });
    });

    const db = env.authenticatedContext(uid).firestore();

    function waitlistData(userId, classId, courseName) {
      return {
        userId,
        classId,
        courseName,
        classStartTime: startTime,
        status: "waiting",
        createdAt: serverTimestamp(),
        cancelledAt: null,
        convertedAt: null,
        lastNotifiedAt: null
      };
    }

    const ownWaitlistRef = doc(
      db,
      "waitlists",
      `${uid}_${fullClassId}`
    );

    await assertSucceeds(
      setDoc(
        ownWaitlistRef,
        waitlistData(uid, fullClassId, "候補測試滿班課程")
      )
    );
    console.log("PASS：滿班時正常加入候補");

    await assertFails(
      setDoc(
        doc(db, "waitlists", `${uid}_${openClassId}`),
        waitlistData(uid, openClassId, "候補測試未滿班課程")
      )
    );
    console.log("PASS：未滿班不能加入候補");

    await assertSucceeds(
      updateDoc(ownWaitlistRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp()
      })
    );
    console.log("PASS：會員可以取消自己的候補");

    await assertSucceeds(
      setDoc(
        ownWaitlistRef,
        waitlistData(uid, fullClassId, "候補測試滿班課程")
      )
    );
    console.log("PASS：取消後可以重新加入候補");

    await assertFails(
      setDoc(
        doc(db, "waitlists", `${otherUid}_${fullClassId}`),
        waitlistData(otherUid, fullClassId, "候補測試滿班課程")
      )
    );
    console.log("PASS：會員不能冒用他人加入候補");

  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error);
  process.exitCode = 1;
});
