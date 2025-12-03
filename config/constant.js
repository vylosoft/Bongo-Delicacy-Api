const orderStatusConfig = () => {
    return new Map([
        [-1, 'CANCELLED'],
        [1, 'ACCEPTED'],
        [2, 'ACCEPTED'],
        [3, 'ACCEPTED'],
        [4, 'DISPATCHED'],
        [5, 'FOOD_READY'],
        [10, 'DELIVERED'],
    ]);
}

module.exports = {
    orderStatusConfig
};
