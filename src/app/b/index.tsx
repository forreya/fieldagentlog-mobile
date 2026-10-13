// fieldagentlog.com/b/ with no block id - a mangled poster link. Route only;
// BlockLink handles a missing id (signed-in home, or login with nothing
// remembered) so the bare path lands somewhere rather than on an unmatched
// route.

import { BlockLink } from "@/screens/blocks/BlockLink";

export default BlockLink;
