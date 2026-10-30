
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MILESTONES = [100, 300, 500] as const;

type MilestoneLevel = (typeof MILESTONES)[number];

type CertificateRecord = {
  userId?: string;
  milestoneClasses?: number;
  certificateName?: string;
  certificateNumber?: string;
  issueDate?: string;
};

type RewardRecord = {
  milestoneClasses: MilestoneLevel;
  certificate: {
    issued: boolean;
    certificateName: string | null;
    certificateNumber: string | null;
    issueDate: string | null;
  };
  gift: {
    status: "not_recorded";
    claimedAt: null;
  };
};

type StudentRewardRecord = {
  userId: string;
  name: string;
  nickname: string;
  email: string;
  journeyLegacyClasses: number;
  rewards: RewardRecord[];
};

function isMilestoneLevel(
  value: unknown
): value is MilestoneLevel {
  return (
    typeof value === "number" &&
    MILESTONES.some((level) => level === value)
  );
}

async function verifyAdmin(
  request: NextRequest
): Promise<string | null> {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const token = authorization.slice(7);

    const decoded = await adminAuth.verifyIdToken(token);

    const userSnapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!userSnapshot.exists) {
      return null;
    }

    const role = String(
      userSnapshot.data()?.role ?? ""
    );

    if (role !== "admin") {
      return null;
    }

    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const adminUserId = await verifyAdmin(request);

    if (!adminUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "沒有管理員權限，無法查看獎勵紀錄。",
        },
        { status: 403 }
      );
    }

    const [usersSnapshot, certificatesSnapshot] =
      await Promise.all([
        adminDb.collection("users").get(),
        adminDb.collection("journeyCertificates").get(),
      ]);

    const certificateMap = new Map<
      string,
      Map<MilestoneLevel, CertificateRecord>
    >();

    for (const certificateDocument of
      certificatesSnapshot.docs) {
      const data =
        certificateDocument.data() as CertificateRecord;

      const userId = String(data.userId ?? "");
      const milestoneClasses = data.milestoneClasses;

      if (
        !userId ||
        !isMilestoneLevel(milestoneClasses)
      ) {
        continue;
      }

      if (!certificateMap.has(userId)) {
        certificateMap.set(userId, new Map());
      }

      certificateMap
        .get(userId)!
        .set(milestoneClasses, data);
    }

    const students: StudentRewardRecord[] =
      usersSnapshot.docs
        .filter((userDocument) => {
          const role = String(
            userDocument.data().role ?? "student"
          );

          return role === "student";
        })
        .map((userDocument) => {
          const data = userDocument.data();

          const userId = userDocument.id;

          const userCertificates =
            certificateMap.get(userId);

          const rewards: RewardRecord[] =
            MILESTONES.map((milestoneClasses) => {
              const certificate =
                userCertificates?.get(milestoneClasses);

              const issued = Boolean(
                certificate?.certificateNumber &&
                  certificate?.issueDate
              );

              return {
                milestoneClasses,
                certificate: {
                  issued,
                  certificateName:
                    certificate?.certificateName ??
                    null,
                  certificateNumber:
                    certificate?.certificateNumber ??
                    null,
                  issueDate:
                    certificate?.issueDate ?? null,
                },
                gift: {
                  status: "not_recorded",
                  claimedAt: null,
                },
              };
            });

          const legacyClasses = Number(
            data.journeyLegacyClasses ?? 0
          );

          return {
            userId,
            name: String(data.name ?? ""),
            nickname: String(data.nickname ?? ""),
            email: String(data.email ?? ""),
            journeyLegacyClasses:
              Number.isSafeInteger(legacyClasses) &&
              legacyClasses >= 0
                ? legacyClasses
                : 0,
            rewards,
          };
        })
        .sort((a, b) =>
          (a.name || a.nickname || a.email).localeCompare(
            b.name || b.nickname || b.email,
            "zh-Hant"
          )
        );

    return NextResponse.json({
      success: true,
      students,
      totalStudents: students.length,
      totalCertificates:
        students.reduce(
          (total, student) =>
            total +
            student.rewards.filter(
              (reward) => reward.certificate.issued
            ).length,
          0
        ),
    });
  } catch (error) {
    console.error(
      "讀取管理員里程碑獎勵紀錄失敗：",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "讀取里程碑獎勵紀錄失敗，請稍後再試。",
      },
      { status: 500 }
    );
  }
}
