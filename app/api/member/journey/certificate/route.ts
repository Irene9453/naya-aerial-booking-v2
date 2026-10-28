
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const CERTIFICATE_MILESTONES = [100, 300, 500] as const;

type CertificateMilestone =
  (typeof CERTIFICATE_MILESTONES)[number];

type CertificateRecord = {
  userId: string;
  milestoneClasses: CertificateMilestone;
  certificateNumber: string;
  issueDate: string;
  certificateName?: string;
  issuedAt?: unknown;
  issuanceId?: string;
};

function isCertificateMilestone(
  value: unknown
): value is CertificateMilestone {
  return (
    typeof value === "number" &&
    CERTIFICATE_MILESTONES.some(
      (milestone) => milestone === value
    )
  );
}

function getCertificateDocumentId(
  userId: string,
  milestoneClasses: CertificateMilestone
) {
  return `${userId}_${milestoneClasses}`;
}

function getIssueDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;

  const month = parts.find(
    (part) => part.type === "month"
  )?.value;

  const day = parts.find(
    (part) => part.type === "day"
  )?.value;

  if (!year || !month || !day) {
    throw new Error("INVALID_ISSUE_DATE");
  }

  return `${year}-${month}-${day}`;
}

function createCertificateNumber(
  milestoneClasses: CertificateMilestone,
  date: Date,
  userId: string
) {
  const datePart = getIssueDate(date).replace(/-/g, "");

  const userHash = createHash("sha256")
    .update(userId)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();

  return `NA${milestoneClasses}-${datePart}-${userHash}`;
}

function normalizeCertificateName(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");

  if (
    name.length < 1 ||
    Array.from(name).length > 60 ||
    /[\u0000-\u001F\u007F]/.test(name)
  ) {
    return null;
  }

  return name;
}

function hasLockedCertificateName(
  record: CertificateRecord
) {
  return (
    typeof record.certificateName === "string" &&
    record.certificateName.trim().length > 0
  );
}

async function getAuthenticatedUserId(
  request: NextRequest
): Promise<string | null> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );

    return decoded.uid;
  } catch {
    return null;
  }
}

async function getCompletedClasses(userId: string) {
  const userSnapshot = await adminDb
    .collection("users")
    .doc(userId)
    .get();

  if (!userSnapshot.exists) {
    throw new Error("USER_NOT_FOUND");
  }

  const legacyClasses = Number(
    userSnapshot.data()?.journeyLegacyClasses ?? 0
  );

  if (
    !Number.isSafeInteger(legacyClasses) ||
    legacyClasses < 0
  ) {
    throw new Error("INVALID_LEGACY_CLASSES");
  }

  const bookingsSnapshot = await adminDb
    .collection("bookings")
    .where("userId", "==", userId)
    .get();

  const systemClasses = bookingsSnapshot.docs.filter(
    (bookingDocument) => {
      const booking = bookingDocument.data();

      if (booking.attendanceStatus !== "present") {
        return false;
      }

      return (
        booking.status === "booked" ||
        (
          booking.status === "admin_cancelled" &&
          booking.cancellationMode === "after_compensation"
        )
      );
    }
  ).length;

  const completedClasses = legacyClasses + systemClasses;

  if (!Number.isSafeInteger(completedClasses)) {
    throw new Error("INVALID_COMPLETED_CLASSES");
  }

  return completedClasses;
}

function certificateResponse(record: CertificateRecord) {
  return {
    success: true,
    certificate: {
      milestoneClasses: record.milestoneClasses,
      certificateNumber: record.certificateNumber,
      issueDate: record.issueDate,
      certificateName: record.certificateName ?? null,
      needsNameConfirmation:
        !hasLockedCertificateName(record),
    },
  };
}

function errorResponse(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "USER_NOT_FOUND") {
      return NextResponse.json(
        { error: "找不到會員資料。" },
        { status: 404 }
      );
    }

    if (
      error.message === "INVALID_LEGACY_CLASSES" ||
      error.message === "INVALID_COMPLETED_CLASSES"
    ) {
      return NextResponse.json(
        { error: "會員累積堂數資料不正確。" },
        { status: 409 }
      );
    }
  }

  console.error("電子證書處理失敗：", error);

  return NextResponse.json(
    { error: "電子證書處理失敗，請稍後再試。" },
    { status: 500 }
  );
}

// 查詢已發出的證書，不會自動發證
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "請先登入會員帳號。" },
        { status: 401 }
      );
    }

    const milestoneParam =
      request.nextUrl.searchParams.get("milestoneClasses");

    const milestoneValue = Number(milestoneParam);

    if (
      !milestoneParam ||
      !isCertificateMilestone(milestoneValue)
    ) {
      return NextResponse.json(
        { error: "不支援的證書里程碑。" },
        { status: 400 }
      );
    }

    const certificateId = getCertificateDocumentId(
      userId,
      milestoneValue
    );

    const certificateSnapshot = await adminDb
      .collection("journeyCertificates")
      .doc(certificateId)
      .get();

    if (!certificateSnapshot.exists) {
      return NextResponse.json({
        success: true,
        certificate: null,
      });
    }

    return NextResponse.json(
      certificateResponse(
        certificateSnapshot.data() as CertificateRecord
      )
    );
  } catch (error) {
    return errorResponse(error);
  }
}

// 新證書正式發證，或舊證書一次性姓名補登
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "請先登入會員帳號。" },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "請提供正確的請求資料。" },
        { status: 400 }
      );
    }

    const milestoneValue =
      typeof body === "object" &&
      body !== null &&
      "milestoneClasses" in body
        ? body.milestoneClasses
        : undefined;

    const requestedName =
      typeof body === "object" &&
      body !== null &&
      "certificateName" in body
        ? body.certificateName
        : undefined;

    if (!isCertificateMilestone(milestoneValue)) {
      return NextResponse.json(
        { error: "僅開放 100、300、500 堂正式證書。" },
        { status: 400 }
      );
    }

    const certificateRef = adminDb
      .collection("journeyCertificates")
      .doc(
        getCertificateDocumentId(
          userId,
          milestoneValue
        )
      );

    const existingSnapshot = await certificateRef.get();

    // 已有正式姓名：直接回傳原證書，永不覆寫。
    if (existingSnapshot.exists) {
      const existingRecord =
        existingSnapshot.data() as CertificateRecord;

      if (hasLockedCertificateName(existingRecord)) {
        return NextResponse.json(
          certificateResponse(existingRecord)
        );
      }
    }

    // 新發證與舊證書補登都需要有效姓名。
    const certificateName =
      normalizeCertificateName(requestedName);

    if (!certificateName) {
      return NextResponse.json(
        {
          error: "請填寫證書姓名，最多 60 個字元。",
        },
        { status: 400 }
      );
    }

    // 只有首次發證需要重新確認堂數。
    // 舊證書已正式發出，不重新審核歷史資格。
    if (!existingSnapshot.exists) {
      const completedClasses =
        await getCompletedClasses(userId);

      if (completedClasses < milestoneValue) {
        return NextResponse.json(
          {
            error:
              `目前累積 ${completedClasses} 堂，` +
              `尚未達成 ${milestoneValue} 堂。`,
          },
          { status: 403 }
        );
      }
    }

    const now = new Date();

    const newCertificateRecord: CertificateRecord = {
      userId,
      milestoneClasses: milestoneValue,
      certificateName,
      certificateNumber: createCertificateNumber(
        milestoneValue,
        now,
        userId
      ),
      issueDate: getIssueDate(now),
    };

    const finalRecord = await adminDb.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(certificateRef);

        if (snapshot.exists) {
          const existingRecord =
            snapshot.data() as CertificateRecord;

          // 已鎖定姓名：永遠不允許更改。
          if (hasLockedCertificateName(existingRecord)) {
            return existingRecord;
          }

          // 舊證書：只更新姓名及補登紀錄。
          // 原編號、發證日期、issuedAt、
          // issuanceId 全部保留。
          transaction.update(certificateRef, {
            certificateName,
            nameConfirmedAt:
              FieldValue.serverTimestamp(),
            nameConfirmationType:
              "legacy_certificate_backfill",
          });

          return {
            ...existingRecord,
            certificateName,
          };
        }

        // 首次正式發證
        transaction.create(certificateRef, {
          ...newCertificateRecord,
          issuedAt: FieldValue.serverTimestamp(),
          issuanceId: randomUUID(),
        });

        return newCertificateRecord;
      }
    );

    return NextResponse.json(
      certificateResponse(finalRecord)
    );
  } catch (error) {
    return errorResponse(error);
  }
}
