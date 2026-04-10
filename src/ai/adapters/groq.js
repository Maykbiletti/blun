module.exports = function createGroqAdapter(config) {
  return {
    name: "groq",
    config: config || {},
    async query() {
      throw new Error("Groq adapter stub: not implemented");
    }
  };
};
