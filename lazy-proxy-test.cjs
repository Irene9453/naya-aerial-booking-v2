function createLazyProxy(factory) {
  let instance;

  return new Proxy({}, {
    get(_target, property) {
      if (!instance) {
        instance = factory();
      }

      const value = Reflect.get(instance, property, instance);

      return typeof value === "function"
        ? value.bind(instance)
        : value;
    }
  });
}

let initializationCount = 0;

const mockFirebase = createLazyProxy(() => {
  initializationCount++;

  return {
    projectId: "demo-naya-aerial",

    verifyIdToken(token) {
      return {
        uid: token,
        projectId: this.projectId
      };
    },

    collection(name) {
      return {
        name,
        projectId: this.projectId
      };
    },

    async runTransaction(callback) {
      return callback({
        projectId: this.projectId
      });
    }
  };
});

async function main() {
  if (initializationCount !== 0) {
    throw new Error("FAIL: Initialized too early");
  }

  const user = mockFirebase.verifyIdToken("test-user");

  if (user.projectId !== "demo-naya-aerial") {
    throw new Error("FAIL: Auth binding");
  }

  const collection = mockFirebase.collection("users");

  if (collection.projectId !== "demo-naya-aerial") {
    throw new Error("FAIL: Firestore binding");
  }

  const result = await mockFirebase.runTransaction(
    async (tx) => tx.projectId
  );

  if (result !== "demo-naya-aerial") {
    throw new Error("FAIL: Transaction binding");
  }

  if (initializationCount !== 1) {
    throw new Error("FAIL: Initialized more than once");
  }

  console.log("PASS: Lazy initialization");
  console.log("PASS: Method binding");
  console.log("PASS: Transaction callback");
  console.log("PASS: Single initialization");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
