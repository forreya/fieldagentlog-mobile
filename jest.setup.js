// AsyncStorage's native module is null under Jest, and by now most of the app
// reaches it somehow - the session store, the role cache, the query cache, the
// geocode cache. The package ships its own in-memory mock; install it once here
// rather than hand-rolling a partial one in every suite that happens to pull it
// in transitively.
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
