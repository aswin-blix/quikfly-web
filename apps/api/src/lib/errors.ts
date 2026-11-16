/** An error with an HTTP status. The error handler turns it into `{ message }`. */
export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = "Please sign in to continue.") => new HttpError(401, m);
export const notFound = (m: string) => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
