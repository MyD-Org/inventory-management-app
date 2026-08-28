import { describe, expect, it } from 'vitest'
import { isApiEditable, orderNeedsReview } from '@/lib/order-statuses'

describe('orderNeedsReview', () => {
    it('returns false when never modified', () => {
        expect(orderNeedsReview({ modified_at: null, delivery_date_verified_at: null })).toBe(false)
    })

    it('returns true when modified but not verified', () => {
        expect(orderNeedsReview({ modified_at: '2026-08-27T10:00:00Z', delivery_date_verified_at: null })).toBe(true)
    })

    it('returns true when modified after verification', () => {
        expect(orderNeedsReview({
            modified_at: '2026-08-27T12:00:00Z',
            delivery_date_verified_at: '2026-08-27T10:00:00Z',
        })).toBe(true)
    })

    it('returns false when verified after modification', () => {
        expect(orderNeedsReview({
            modified_at: '2026-08-27T10:00:00Z',
            delivery_date_verified_at: '2026-08-27T12:00:00Z',
        })).toBe(false)
    })
})

describe('isApiEditable', () => {
    it('allows early statuses', () => {
        expect(isApiEditable('por_revisar')).toBe(true)
        expect(isApiEditable('recibido')).toBe(true)
        expect(isApiEditable('en_proceso')).toBe(true)
    })

    it('blocks late statuses', () => {
        expect(isApiEditable('embalado')).toBe(false)
        expect(isApiEditable('facturado')).toBe(false)
        expect(isApiEditable('listo_para_retirar')).toBe(false)
        expect(isApiEditable('retirado')).toBe(false)
        expect(isApiEditable('cancelado')).toBe(false)
    })
})
