const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatTime() {
  return timeFormatter.format(new Date()).replace(/\./g, ":");
}

function createLogger(scope) {
  function write(level, message) {
    const method = level === "err" ? "error" : level === "wrn" ? "warn" : "log";
    console[method](`${formatTime()} wib | ${level} | ${scope} | ${message}`);
  }

  return {
    info(message) {
      write("inf", message);
    },
    warn(message) {
      write("wrn", message);
    },
    error(message) {
      write("err", message);
    },
    success(message) {
      write("ok", message);
    }
  };
}

module.exports = {
  createLogger
};
