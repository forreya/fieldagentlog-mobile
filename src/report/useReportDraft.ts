// The report form's state, and the one thing it must get right: the report is
// on disk before anything else happens.
//
// Persist-first, like attendance and like a visit submit. Someone standing in a
// bin store with no signal taps Send, sees it accepted, and walks away. The
// queue owns the rest. Nothing here waits for a request.

import { useCallback, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { saveReport } from "@/db/reports";
import { uuid } from "@/lib/id";
import type { ReportCategory } from "@/db/types";
import { captureReportFix } from "@/lib/position";
import { syncEngine } from "@/sync/engine";
import { deniedMessage, pickAndStore, type CaptureSource } from "@/visit/photos";

import { canAddPhoto, draftProblem, emptyDraft, MAX_PHOTOS, toPendingReport, type Draft } from "./draft";

export interface ReportDraftView {
	draft: Draft;
	busy: boolean;
	/** Set once the reporter has tried to send, so the form does not scold
	 *  somebody who is still typing. */
	tried: boolean;
	error: string | null;
	canAddPhoto: boolean;
	setCategory: (category: ReportCategory) => void;
	setNote: (note: string) => void;
	addPhoto: (source: CaptureSource) => Promise<void>;
	removePhoto: (localId: string) => void;
	/** Resolves true when the report is saved and queued. */
	send: () => Promise<boolean>;
	dismissError: () => void;
}

interface SendDeps {
	attendanceClientId: string | null;
	busy: boolean;
	draft: Draft;
	ownerUserId: string | null;
	site: { id: string; name: string } | null;
	setBusy: (value: boolean) => void;
	setError: (value: string | null) => void;
	setTried: (value: boolean) => void;
}

/** Sending. Lifted out of the hook for the size budget, like useEndVisit. */
function useSend({ attendanceClientId, busy, draft, ownerUserId, site, setBusy, setError, setTried }: SendDeps): () => Promise<boolean> {
	return useCallback(async () => {
		if (busy) return false;
		setTried(true);
		if (!site) {
			setError("Choose which site this is about.");
			return false;
		}
		const problem = draftProblem(draft);
		if (problem) {
			setError(problem);
			return false;
		}

		setBusy(true);
		setError(null);
		try {
			// The fix is best-effort and deliberately awaited: eight seconds at
			// worst, and a report with a position is worth more to whoever picks
			// it up. It never blocks the report itself - null is a fine answer.
			const point = await captureReportFix();
			await saveReport(toPendingReport(draft, site, point, attendanceClientId, ownerUserId));
			void syncEngine.sync("report");
			return true;
		} catch {
			// saveReport throws on a storage failure, on purpose (see db/reports).
			// Swallowing it here would stop the spinner and say nothing - the one
			// outcome that flow exists to prevent. The draft is still on screen,
			// so trying again costs a tap.
			setError("Couldn't save the report on this phone. Try again.");
			return false;
		} finally {
			setBusy(false);
		}
	}, [attendanceClientId, busy, draft, site, ownerUserId, setBusy, setError, setTried]);
}

/**
 * `site` is null while a cleaner has not picked one yet. A report with no site
 * is not a report - the broker has nowhere to file it - so this is a validation
 * rule like the note, not a reason to refuse to render the form.
 */
export function useReportDraft(site: { id: string; name: string } | null, attendanceClientId: string | null): ReportDraftView {
	const { state } = useAuth();
	// Who this report will belong to. The queue outlives the session, so the
	// owner is recorded on the row at capture time (see db/types.ts).
	const ownerUserId = state.status === "signed_in" ? state.user.id : null;
	const [draft, setDraft] = useState<Draft>(emptyDraft);
	const [busy, setBusy] = useState(false);
	const [tried, setTried] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const addPhoto = useCallback(
		async (source: CaptureSource) => {
			if (!canAddPhoto(draft)) {
				setError(`You can attach up to ${MAX_PHOTOS} photos.`);
				return;
			}
			const outcome = await pickAndStore(source, `report-${Date.now()}.jpg`);
			if (outcome.status === "cancelled") return;
			if (outcome.status !== "stored") {
				setError(outcome.status === "denied" ? deniedMessage(outcome.source) : outcome.message);
				return;
			}
			setDraft((current) => ({ ...current, photos: [...current.photos, { local_id: uuid(), file: outcome.file }] }));
		},
		[draft],
	);

	const send = useSend({ attendanceClientId, busy, draft, ownerUserId, site, setBusy, setError, setTried });

	return {
		draft,
		busy,
		tried,
		error,
		canAddPhoto: canAddPhoto(draft),
		setCategory: useCallback((category: ReportCategory) => setDraft((current) => ({ ...current, category })), []),
		setNote: useCallback((note: string) => setDraft((current) => ({ ...current, note })), []),
		addPhoto,
		removePhoto: useCallback((localId: string) => setDraft((c) => ({ ...c, photos: c.photos.filter((p) => p.local_id !== localId) })), []),
		send,
		dismissError: useCallback(() => setError(null), []),
	};
}
