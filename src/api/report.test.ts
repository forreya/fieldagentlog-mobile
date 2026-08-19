// The report upload boundary: the part shape (FIND-011) and the ref mapping.

import * as brokerModule from "./broker";
import { uploadReportPhoto } from "./report";

jest.mock("expo-file-system");
jest.mock("./broker");

const broker = brokerModule as jest.Mocked<typeof brokerModule>;

beforeEach(() => {
	jest.clearAllMocks();
	broker.callBroker.mockResolvedValue({ ref: "org/reports/x.jpg", file_name: "IMG_9.jpeg", content_type: "image/jpeg" });
});

const file = { uri: "file:///photos/uuid-1.jpg", name: "IMG_9.jpeg", type: "image/jpeg" };

test("sends a part the runtime's fetch accepts, plus the block id", async () => {
	const append = jest.spyOn(FormData.prototype, "append");

	await uploadReportPhoto("block-1", file);

	// Part first, block_id alongside - same FormData, same field names the
	// broker has always parsed.
	const calls = append.mock.calls as [string, unknown][];
	const filePart = calls.find(([field]) => field === "file")?.[1] as Record<string, unknown>;
	expect(filePart).not.toHaveProperty("uri");
	expect(typeof filePart.bytes).toBe("function");
	expect(filePart).toMatchObject({ name: "IMG_9.jpeg", type: "image/jpeg" });
	expect(calls.find(([field]) => field === "block_id")?.[1]).toBe("block-1");

	const [fn, body] = broker.callBroker.mock.calls[0];
	expect(fn).toBe("site-report");
	expect(body).toBeInstanceOf(FormData);
	append.mockRestore();
});

test("maps the upload's ref into the shape the create call cites", async () => {
	// The upload calls it `ref`; the create call names the same string `path`.
	await expect(uploadReportPhoto("block-1", file)).resolves.toEqual({
		path: "org/reports/x.jpg",
		file_name: "IMG_9.jpeg",
		content_type: "image/jpeg",
	});
});
