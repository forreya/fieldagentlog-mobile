// The report form's state, and the one thing it must get right: the report is
// on disk before anything else happens.
//
// Persist-first, like attendance and like a visit submit. Someone standing in a
// bin store with no signal taps Send, sees it accepted, and walks away. The
// queue owns the rest. Nothing here waits for a request.

import { useCallback, useState } from "react";

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

/**
 * `site` is null while a cleaner has not picked one yet. A report with no site
 * is not a report - the broker has nowhere to file it - so this is a validation
 * rule like the note, not a reason to refuse to render the form.
 */
export function useReportDraft(site: { id: string; name: string } | null, attendanceClientId: string | null): ReportDraftView {
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

	const send = useCallback(async () => {
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
			await saveReport(toPendingReport(draft, site, point, attendanceClientId));
			void syncEngine.sync("report");
			return true;
		} finally {
			setBusy(false);
		}
	}, [attendanceClientId, busy, draft, site]);

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
