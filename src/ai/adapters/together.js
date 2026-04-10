module.exports = function createTogetherAdapter(config) {
  return {
    name: "together",
    config: config || {},
    async query() {
      throw new Error("Together adapter stub: not implemented");
    }
  };
};
