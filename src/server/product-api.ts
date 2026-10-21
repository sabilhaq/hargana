import { auth } from "./auth";
import { createProductHandlers, openFoodFacts } from "./open-food-facts";

export const productHandlers = createProductHandlers({
  off: openFoodFacts(),
  session: (request) => auth.api.getSession({ headers: request.headers }),
});
