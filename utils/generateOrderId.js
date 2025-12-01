// utils/orderId.js

// pattern: <LETTER>-<NUMBER>, e.g. A-6, B-100
const generateOrderId = () => {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  const number = Math.floor(Math.random() * 9999) + 1; // 1..9999
  return `${letter}-${number}`;
};

module.exports = {
  generateOrderId
};
