import { createContext, useContext } from "react";

const NavbarActionsContext = createContext<HTMLDivElement | null>(null);

export default NavbarActionsContext;

export function useNavbarActionsTarget() {
  return useContext(NavbarActionsContext);
}
