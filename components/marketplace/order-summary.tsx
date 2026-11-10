import { peso, num } from "@/lib/format";
import type { OrderItemRow, OrderRow } from "@/lib/types";

export function OrderItemsTable({ order, items }: { order: OrderRow; items: OrderItemRow[] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="table">
        <caption className="sr-only">Order items</caption>
        <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Line total</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><p className="font-medium text-ink">{item.brand} {item.model}</p><p className="text-xs text-muted">{item.title}</p></td>
              <td className="table-num text-right">{num(item.quantity)}</td>
              <td className="table-num text-right">{item.unit_price_php != null ? peso(item.unit_price_php) : <span className="text-muted">On request</span>}</td>
              <td className="table-num text-right">{item.line_total_php != null ? peso(item.line_total_php) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th colSpan={3} className="text-right">Items subtotal (listed prices)</th><td className="table-num text-right">{order.subtotal_php != null ? peso(order.subtotal_php) : "To be quoted"}</td></tr>
          {order.delivery_fee_php != null ? <tr><th colSpan={3} className="text-right">Delivery</th><td className="table-num text-right">{peso(order.delivery_fee_php)}</td></tr> : null}
          <tr><th colSpan={3} className="text-right text-ink">Confirmed total</th><td className="table-num text-right font-semibold text-ink">{order.total_php != null ? peso(order.total_php) : "Waiting for supplier"}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}
