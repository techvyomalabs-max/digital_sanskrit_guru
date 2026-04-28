import { useContext } from "react";
import { DeliveryLocationContext } from "../context/DeliveryLocationContext";

export function useDeliveryLocation() {
  return useContext(DeliveryLocationContext);
}
