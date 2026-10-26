const cluster = require("cluster");

const W = cluster.isWorker ? Math.max(1, Number(process.env.WEB_CONCURRENCY) || 1) : 1;

module.exports.perWorker = (n) => Math.max(1, Math.ceil(n / W));
