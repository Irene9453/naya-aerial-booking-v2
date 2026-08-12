"use client";

import { FormEvent, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

function normalizeTaiwanPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function isValidTaiwanMobile(phone: string) {
  return /^09\d{8}$/.test(phone);
}

export default function RegisterPage() {
    const router = useRouter();
  const [name, setName] = useState("");
const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [experience, setExperience] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
function getSafeRedirectPath() {
  if (typeof window === "undefined") {
    return "/member";
  }

  const params = new URLSearchParams(
    window.location.search
  );

  const redirect = params.get("redirect");

  if (!redirect) {
    return "/member";
  }

  if (
    !redirect.startsWith("/") ||
    redirect.startsWith("//")
  ) {
    return "/member";
  }

  return redirect;
}
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");

    const normalizedPhone =
      normalizeTaiwanPhone(phone);

    if (!isValidTaiwanMobile(normalizedPhone)) {
      setMessage(
        "請輸入正確的台灣手機號碼，例如 0912345678。"
      );
      return;
    }

    if (!birthday) {
      setMessage("請填寫生日。");
      return;
    }

    const birthdayDate = new Date(
      `${birthday}T00:00:00`
    );

    if (
      Number.isNaN(
        birthdayDate.getTime()
      )
    ) {
      setMessage("生日格式不正確。");
      return;
    }

    const birthdayYear =
  birthdayDate.getFullYear();

const birthdayMonth =
  birthdayDate.getMonth() + 1;

const birthdayDay =
  birthdayDate.getDate();

setIsSubmitting(true);

    let createdUser:
      | typeof auth.currentUser
      | null = null;

    try {
      // 1. 先建立 Firebase Auth 帳號
      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      createdUser = credential.user;

      const userRef = doc(
        db,
        "users",
        credential.user.uid
      );

      const phoneRegistryRef = doc(
        db,
        "phoneRegistry",
        normalizedPhone
      );

      // 2. 用 transaction 確保手機只能註冊一次
      await runTransaction(
        db,
        async (transaction) => {
          const phoneRegistrySnapshot =
            await transaction.get(
              phoneRegistryRef
            );

          if (
            phoneRegistrySnapshot.exists()
          ) {
            throw new Error(
              "PHONE_ALREADY_REGISTERED"
            );
          }

          transaction.set(userRef, {
            name: name.trim(),
nickname: nickname.trim(),
            phone: normalizedPhone,
            phoneNormalized:
              normalizedPhone,

            phoneVerified: false,

            experience,

            email: email
              .trim()
              .toLowerCase(),

            // 上課點數
            points: 0,

            // 紅利點數
            rewardPoints: 0,

            // 新生優惠資格
            isNewStudent: true,

            // 生日優惠使用
            birthdayMonth,
            birthdayDay,

            role: "student",

            createdAt:
              serverTimestamp(),
          });

          transaction.set(
            phoneRegistryRef,
            {
              userId:
                credential.user.uid,

              phone:
                normalizedPhone,

              createdAt:
                serverTimestamp(),
            }
          );
        }
      );

      const redirectPath = getSafeRedirectPath();

if (redirectPath === "/booking") {
  setMessage(
    "註冊成功！正在返回課程預約……"
  );
} else {
  setMessage(
    "註冊成功！正在前往會員中心……"
  );
}

router.replace(redirectPath);

      setName("");
setNickname("");
setPhone("");
setBirthday("");
      setExperience("");
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      console.error(error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "";

      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(
              (
                error as {
                  code?: string;
                }
              ).code ?? ""
            )
          : "";

      // 如果 Firestore 建檔失敗，
      // 把剛建立的 Auth 帳號刪除，
      // 避免留下半套會員
      if (
        createdUser &&
        errorCode !==
          "auth/email-already-in-use"
      ) {
        try {
          await deleteUser(
            createdUser
          );
        } catch (
          deleteError
        ) {
          console.error(
            "刪除未完成註冊的 Auth 帳號失敗：",
            deleteError
          );
        }
      }

      if (
        errorMessage ===
        "PHONE_ALREADY_REGISTERED"
      ) {
        setMessage(
          "這支手機號碼已經註冊過會員，請直接登入；若忘記帳號，請聯絡老師。"
        );
      } else if (
        errorCode ===
        "auth/email-already-in-use"
      ) {
        setMessage(
          "這個 Email 已經註冊過，請改用登入功能。"
        );
      } else if (
        errorCode ===
        "auth/weak-password"
      ) {
        setMessage(
          "密碼強度不足，請至少輸入 6 碼。"
        );
      } else if (
        errorCode ===
        "auth/invalid-email"
      ) {
        setMessage(
          "Email 格式不正確。"
        );
      } else if (
        errorCode ===
          "permission-denied" ||
        errorCode ===
          "firestore/permission-denied"
      ) {
        setMessage(
          "會員資料寫入失敗，請聯繫老師。"
        );
      } else {
        setMessage(
          `註冊失敗：${
            errorCode ||
            errorMessage ||
            "未知錯誤"
          }`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="bg-sky-50 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Membership
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            建立會員帳號
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            註冊一次後，未來預約不需重複填寫個人資料。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-10"
        >
          <div className="space-y-6">
            <div>
  <label
    htmlFor="name"
    className="mb-2 block font-semibold text-slate-800"
  >
    姓名（本名）
  </label>

  <input
    id="name"
    type="text"
    required
    value={name}
    onChange={(event) =>
      setName(event.target.value)
    }
    placeholder="請填寫真實姓名"
    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
  />

  <p className="mt-2 text-xs leading-5 text-slate-500">
    請填寫真實姓名，供老師核對會員身分使用。
  </p>
</div>
<div>
  <label
    htmlFor="nickname"
    className="mb-2 block font-semibold text-slate-800"
  >
    暱稱／綽號
    <span className="ml-2 text-xs font-normal text-slate-400">
      選填
    </span>
  </label>

  <input
    id="nickname"
    type="text"
    value={nickname}
    onChange={(event) =>
      setNickname(event.target.value)
    }
    placeholder="例如：Naya、娜娜"
    maxLength={20}
    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
  />

  <p className="mt-2 text-xs leading-5 text-slate-500">
    可填寫平常上課希望老師稱呼你的名字。
  </p>
</div>

            <div>
              <label
                htmlFor="phone"
                className="mb-2 block font-semibold text-slate-800"
              >
                手機號碼
              </label>

              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                required
                value={phone}
                onChange={(event) =>
                  setPhone(
                    event.target.value
                  )
                }
                placeholder="0912345678"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />

              <p className="mt-2 text-xs leading-5 text-slate-500">
                每支手機號碼只能註冊一個會員帳號。
              </p>
            </div>

            <div>
              <label
                htmlFor="birthday"
                className="mb-2 block font-semibold text-slate-800"
              >
                生日
              </label>

              <input
                id="birthday"
                type="date"
                required
                value={birthday}
                onChange={(event) =>
                  setBirthday(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />

              <p className="mt-2 text-xs leading-5 text-slate-500">
                生日將用於生日優惠資格判定，註冊後如需修改請聯絡老師。
              </p>
            </div>

            <div>
              <label
                htmlFor="experience"
                className="mb-2 block font-semibold text-slate-800"
              >
                空中運動經驗
              </label>

              <select
                id="experience"
                required
                value={experience}
                onChange={(event) =>
                  setExperience(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">
                  請選擇
                </option>
                <option value="第一次體驗">
                  第一次體驗
                </option>
                <option value="未滿三個月">
                  未滿三個月
                </option>
                <option value="三個月至一年">
                  三個月至一年
                </option>
                <option value="一年以上">
                  一年以上
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block font-semibold text-slate-800"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block font-semibold text-slate-800"
              >
                密碼
              </label>

              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                placeholder="至少 6 碼"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-8 w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "建立帳號中…"
              : "建立會員帳號"}
          </button>

          {message && (
            <p className="mt-5 text-center text-sm leading-6 text-slate-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}