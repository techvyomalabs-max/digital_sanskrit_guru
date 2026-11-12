module.exports = {
  // Off: keeping any part of the payment (e.g. the gateway fee) would itself be a taxable supply
  deductGatewayFeeOnCustomerChoice: false,
  refundDeliveryOnCustomerChoice: false,
  refundDeliveryOnStoreFault: true, // only when ALL physical items end up returned/refunded
  // Store's fault (damaged/defective): refund the item's share of delivery with it
  refundDeliveryShareOnStoreFault: true,
  returnShippingDeductionInr: 0
};
