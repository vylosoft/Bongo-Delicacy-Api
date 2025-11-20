module.exports = async ({ sequelize }) => {
  await sequelize.authenticate();
//   await sequelize.sync({ alter: false });
};
