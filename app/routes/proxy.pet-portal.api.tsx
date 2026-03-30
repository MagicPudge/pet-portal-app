import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { handlePetPortalAction, handlePetPortalLoader, petPortalHeaders } from "./pet-portal/proxy.server";

const routeConfig = {
  routeTag: "proxy.pet-portal.api",
  routePath: "/apps/pet-portal/api",
  apiPath: "/apps/pet-portal/api",
} as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return handlePetPortalLoader(request, routeConfig);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return handlePetPortalAction(request, routeConfig);
};

export const headers: HeadersFunction = () => petPortalHeaders();
