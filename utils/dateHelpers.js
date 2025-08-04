// utils/dateHelpers.js

function toUtcMidnight(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

module.exports = {
  toUtcMidnight,
};
