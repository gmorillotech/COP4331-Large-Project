const adminUserService = require("../services/adminUserService");

// GET /api/admin/users
const listUsers = async (req, res) => {
  try {
    const users = await adminUserService.listUsers(req.query.q);
    return res.status(200).json({ users });
  } catch (error) {
    return res.status(500).json({ error: "Server error while listing users." });
  }
};

// PATCH /api/admin/users/:userId
const editUser = async (req, res) => {
  try {
    const { email, userOccupancyWF, role, accountStatus } = req.body ?? {};
    const updates = {};
    if (email !== undefined) updates.email = email;
    if (userOccupancyWF !== undefined) updates.userOccupancyWF = userOccupancyWF;
    if (role !== undefined) updates.role = role;
    if (accountStatus !== undefined) updates.accountStatus = accountStatus;

    const result = await adminUserService.editUser(
      req.params.userId,
      updates,
      req.user.userId,
    );

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({ message: "User updated", user: result.user });
  } catch (error) {
    return res.status(500).json({ error: "Server error while editing user." });
  }
};

// POST /api/admin/users/:userId/force-password-reset
const forcePasswordReset = async (req, res) => {
  try {
    const result = await adminUserService.forcePasswordReset(
      req.params.userId,
      req.user.userId,
    );

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res
      .status(200)
      .json({ message: "Password reset forced", userId: result.userId });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Server error while forcing password reset." });
  }
};

// DELETE /api/admin/users/:userId
const deleteUser = async (req, res) => {
  try {
    const result = await adminUserService.deleteUser(
      req.params.userId,
      req.user.userId,
    );

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res
      .status(200)
      .json({ message: "User deleted", userId: result.userId });
  } catch (error) {
    return res.status(500).json({ error: "Server error while deleting user." });
  }
};

module.exports = {
  listUsers,
  editUser,
  forcePasswordReset,
  deleteUser,
};
