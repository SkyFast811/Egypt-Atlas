import { createContext, type Dispatch, type SetStateAction } from "react";

export type RouteStop = {
	name: string;
	coordinates: [number, number];
};

export const RoutingContext = createContext<
	[RouteStop[], Dispatch<SetStateAction<RouteStop[]>>] | null
>(null);
