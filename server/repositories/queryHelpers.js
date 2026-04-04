async function resolveQuery(query) {
  if (query && typeof query.lean === "function") {
    return query.lean();
  }

  if (query && typeof query.toObject === "function") {
    return query.toObject();
  }

  return query;
}

module.exports = {
  resolveQuery,
};
