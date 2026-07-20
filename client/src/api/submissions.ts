import axios from "axios";
import type { Language } from "../lib/languages";

// const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
const BACKEND_URL = "http://localhost:3000";


export interface Submission {
    status: string;
    output?: string;
    stdErr?: string;
}

interface CreateSubmissionResponse {
    id: string;
}

interface GetSubmissionResponse {
    submission: Submission;
}

export async function createSubmission(
    code: string,
    language: Language,
    signal?: AbortSignal,
) {
    const response = await axios.post<CreateSubmissionResponse>(
        `${BACKEND_URL}/submission`,
        {
            code,
            language,
        },
        {
            signal,
        },
    );

    return response.data;
}

export async function getSubmission(
    submissionId: string,
    signal?: AbortSignal,
) {
    const response = await axios.get<GetSubmissionResponse>(
        `${BACKEND_URL}/submission/${submissionId}`,
        {
            signal,
        },
    );

    return response.data;
}