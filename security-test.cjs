const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");

const { doc, setDoc, updateDoc } = require("firebase/firestore");

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: "demo-naya-aerial",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync("firestore.safe.rules", "utf8")
    }
  });

  try {
    const studentId = "security-test-student";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", studentId), {
        uid: studentId,
        role: "student",
        points: 10,
        rewardPoints: 0
      });
    });

    const studentDb = testEnv
      .authenticatedContext(studentId)
      .firestore();

    await assertFails(
      updateDoc(doc(studentDb, "users", studentId), {
        points: 999999
      })
    );

    console.log("PASS：會員無法自行增加點數");

    await assertFails(
      updateDoc(doc(studentDb, "users", "another-student"), {
        points: 999999
      })
    );

    console.log("PASS：會員無法修改其他人的點數");

  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error);
  process.exitCode = 1;
});
