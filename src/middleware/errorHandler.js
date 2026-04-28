function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  console.error(`  [ERROR ${status}] ${req.method} ${req.path} - ${message}`);
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
