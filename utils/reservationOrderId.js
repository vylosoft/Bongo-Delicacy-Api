// utils/orderId.js

let lastDate = null;
let counter = 0;

const generateOrderId = () => {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const today = `${yyyy}${mm}${dd}`;

  // reset counter when date changes
  if (lastDate !== today) {
    lastDate = today;
    counter = 0;
  }

  counter++;

  const padded = String(counter).padStart(4, "0");

  return `R-${today}${hh}${min}${ss}-${padded}`;
};

module.exports = { generateOrderId };

