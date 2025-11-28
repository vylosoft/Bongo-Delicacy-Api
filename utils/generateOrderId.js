exports.generateOrderId = () => {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const r = Math.floor(1000 + Math.random() * 9000);
  return `${d}${m}${y}-${r}`;
};
