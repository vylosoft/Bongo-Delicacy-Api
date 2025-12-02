// utils/orderId.js

let lastDate = null;
let counter = 0;

const generateOrderId = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const today = `${yyyy}${mm}${dd}`;

  // Reset counter if date changed
  if (lastDate !== today) {
    lastDate = today;
    counter = 0;
  }

  counter++;

  const padded = String(counter).padStart(4, "0");
  return `O-${today}-${padded}`;
};

module.exports = { generateOrderId };
