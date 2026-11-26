import { translateMessage } from '../../i18n'

export class OperationsError extends Error {
  constructor(
    public readonly vi: string,
    public readonly en: string,
  ) {
    super(vi)
    this.name = 'OperationsError'
  }
}
export const reject = (vi: string, en: string): never => {
  throw new OperationsError(vi, en)
}
export const operationsErrorMessage = (error: unknown, locale: 'vi' | 'en') =>
  error instanceof OperationsError
    ? locale === 'vi'
      ? error.vi
      : error.en
    : error instanceof Error
      ? translateMessage(error.message, locale)
      : locale === 'vi'
        ? 'Không thể thực hiện thao tác. Vui lòng thử lại.'
        : 'Unable to complete this action. Please try again.'
