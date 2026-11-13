const checkOwnership = (paramName = 'id') => (req, res, next) => {
  const resourceId = req.params[paramName];
  const userId = req.user.id;
  const userRole = req.user.role;

  if (userRole === 'SuperAdmin') {
    return next();
  }

  if (userId !== resourceId) {
    return res.status(403).json({
      success: false,
      message: 'Akses dilarang. Anda hanya dapat mengakses data sendiri.'
    });
  }

  next();
};

module.exports = { checkOwnership };