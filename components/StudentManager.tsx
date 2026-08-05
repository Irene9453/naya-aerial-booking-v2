"use client";

import AdminPointButton from "@/components/AdminPointButton";
import SellPackageButton from "@/components/SellPackageButton";

export type StudentData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  points: number;
  role: string;
};

type StudentManagerProps = {
  students: StudentData[];
};

export default function StudentManager({
  students,
}: StudentManagerProps) {
  const studentList = students.filter(
    (student) => student.role === "student"
  );

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Students
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            會員與點數
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            目前共有 {studentList.length} 位學生
          </p>
        </div>
      </div>

      {studentList.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前尚未建立學生會員。
          </p>
        </div>
      ) : (
        <div className="mt-7 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-semibold">
                  姓名
                </th>

                <th className="px-4 py-3 font-semibold">
                  Email
                </th>

                <th className="px-4 py-3 font-semibold">
                  電話
                </th>

                <th className="px-4 py-3 font-semibold">
                  經驗
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  點數
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {studentList.map((student) => (
                <tr
                  key={student.id}
                  className="border-b border-slate-100"
                >
                  <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                    {student.name || "未填寫"}
                  </td>

                  <td className="px-4 py-4 text-slate-600">
                    {student.email || "未填寫"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {student.phone || "未填寫"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {student.experience || "未填寫"}
                  </td>

                  <td className="px-4 py-4 text-right text-lg font-bold text-sky-600">
                    {student.points}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex min-w-max justify-end gap-2">
                      <SellPackageButton
                        studentId={student.id}
                        studentName={student.name}
                        currentPoints={student.points}
                      />

                      <AdminPointButton
                        studentId={student.id}
                        studentName={student.name}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}