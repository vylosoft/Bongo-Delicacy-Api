const orderStatusConfig = () => {
  return new Map([
   // 👈 PetPuja initial state
    [-1, 'CANCELLED'],
    [1, 'ACCEPTED'],
    [2, 'ACCEPTED'],
    [3, 'ACCEPTED'],
    [4, 'DISPATCHED'],
    [5, 'FOOD_READY'],
    [10, 'DELIVERED'],
  ]);
};

const riderStatusConfig =() =>{
  return {
    ACCEPTED : "ACCEPTED", //Order Created Successfully. 
    ALLOTTED: "ALLOTTED", // Rider Allotted to pick up the items.
    ARRIVED: "ARRIVED", //Rider has reached the pickup location. 
    DISPATCHED: "DISPATCHED", //Order is picked up by the rider. 
    ARRIVED_CUSTOMER_DOORSTEP : "ARRIVED_CUSTOMER_DOORSTEP", //Rider has reached the drop-off location.
    DELIVERED: "DELIVERED", //Successfully delivered, and the transaction has concluded.
    CANCELLED: "CANCELLED", // Task is cancelled,
    SEARCHING_FOR_NEW_RIDER: "SEARCHING_FOR_NEW_RIDER", //SEARCHING_FOR_NEW_RIDER
    RTO_INIT : "RTO_INIT", //RTO is initiated 
    RTO_COMPLETE : "RTO_COMPLETE" //RTO is completed
  }
}



module.exports = { orderStatusConfig, riderStatusConfig };
