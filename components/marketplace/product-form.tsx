"use client";

import { useState } from "react";
import { saveProductAction } from "@/app/actions/supplier";
import { ActionForm } from "@/components/marketplace/action-form";
import type { ProductSpecs } from "@/lib/marketplace";
import type { ProductRow } from "@/lib/types";

export function ProductForm({ product, specs }: { product?: ProductRow; specs?: ProductSpecs }) {
  const [category, setCategory] = useState<string>(product?.category ?? "panel");
  const s = specs ?? {};
  return (
    <ActionForm action={saveProductAction} submitLabel={product ? "Save changes" : "Submit for review"}>
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">What it is</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="label">Category</label>
            <select id="category" name="category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="panel">Solar panel</option>
              <option value="inverter">Inverter</option>
              <option value="battery">Battery</option>
              <option value="mounting">Mounting / racking</option>
              <option value="accessory">Cables / accessories</option>
            </select>
          </div>
          <div>
            <label htmlFor="brand" className="label">Brand</label>
            <input id="brand" name="brand" className="input" defaultValue={product?.brand} required />
          </div>
          <div>
            <label htmlFor="model" className="label">Model number</label>
            <input id="model" name="model" className="input" defaultValue={product?.model} required />
          </div>
          <div>
            <label htmlFor="title" className="label">Listing title</label>
            <input id="title" name="title" className="input" defaultValue={product?.title} placeholder="e.g. 550 W mono PERC panel" required />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="label">Description <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="description" name="description" className="textarea" defaultValue={product?.description ?? ""} />
          </div>
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Key specifications</legend>
        <p className="help">Only enter figures from the official datasheet. Leave unknown fields blank.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {category === "panel" ? (
            <>
              <div><label htmlFor="ratedPowerW" className="label">Rated power (W)</label><input id="ratedPowerW" name="ratedPowerW" type="number" min={0} className="input" defaultValue={s.ratedPowerW ?? ""} /></div>
              <div><label htmlFor="efficiencyPct" className="label">Efficiency (%)</label><input id="efficiencyPct" name="efficiencyPct" type="number" step="0.1" min={0} max={100} className="input" defaultValue={s.efficiencyPct ?? ""} /></div>
            </>
          ) : null}
          {category === "inverter" ? (
            <>
              <div><label htmlFor="ratedKw" className="label">Rated output (kW)</label><input id="ratedKw" name="ratedKw" type="number" step="0.1" min={0} className="input" defaultValue={s.ratedKw ?? ""} /></div>
              <div>
                <label htmlFor="inverterType" className="label">Type</label>
                <select id="inverterType" name="inverterType" className="select" defaultValue={s.inverterType ?? ""}>
                  <option value="">Not specified</option><option value="grid_tie">Grid-tie</option><option value="hybrid">Hybrid</option><option value="off_grid">Off-grid</option>
                </select>
              </div>
              <div>
                <label htmlFor="phase" className="label">Phase</label>
                <select id="phase" name="phase" className="select" defaultValue={s.phase ?? ""}>
                  <option value="">Not specified</option><option value="single">Single-phase</option><option value="three">Three-phase</option>
                </select>
              </div>
              <div><label htmlFor="batteryVoltageV" className="label">Battery input voltage (V)</label><input id="batteryVoltageV" name="batteryVoltageV" type="number" step="0.1" min={0} className="input" defaultValue={s.batteryVoltageV ?? ""} placeholder="Hybrid / off-grid only" /></div>
            </>
          ) : null}
          {category === "battery" ? (
            <>
              <div><label htmlFor="nominalVoltageV" className="label">Nominal voltage (V)</label><input id="nominalVoltageV" name="nominalVoltageV" type="number" step="0.1" min={0} className="input" defaultValue={s.nominalVoltageV ?? ""} placeholder="e.g. 51.2" /></div>
              <div><label htmlFor="capacityAh" className="label">Capacity (Ah)</label><input id="capacityAh" name="capacityAh" type="number" step="0.1" min={0} className="input" defaultValue={s.capacityAh ?? ""} /></div>
              <div><label htmlFor="capacityKwh" className="label">Nominal capacity (kWh)</label><input id="capacityKwh" name="capacityKwh" type="number" step="0.01" min={0} className="input" defaultValue={s.capacityKwh ?? ""} /><p className="help">Leave blank to calculate from volts × Ah.</p></div>
              <div><label htmlFor="usableCapacityKwh" className="label">Usable capacity (kWh)</label><input id="usableCapacityKwh" name="usableCapacityKwh" type="number" step="0.01" min={0} className="input" defaultValue={s.usableCapacityKwh ?? ""} /><p className="help">Only if the datasheet states it.</p></div>
              <div><label htmlFor="dodPercent" className="label">Depth of discharge (%)</label><input id="dodPercent" name="dodPercent" type="number" step="1" min={0} max={100} className="input" defaultValue={s.dodPercent ?? ""} /></div>
              <div><label htmlFor="chemistry" className="label">Chemistry</label><input id="chemistry" name="chemistry" className="input" defaultValue={s.chemistry ?? ""} placeholder="e.g. LiFePO4" /></div>
            </>
          ) : null}
          {category === "battery" || category === "inverter" ? (
            <>
              <div><label htmlFor="communication" className="label">BMS communication</label><input id="communication" name="communication" className="input" defaultValue={(s.communication ?? []).join(", ")} placeholder="e.g. CAN, RS485" /></div>
              <div className="sm:col-span-2">
                <label htmlFor="compatibleModels" className="label">Manufacturer-listed compatible models</label>
                <input id="compatibleModels" name="compatibleModels" className="input" defaultValue={(s.compatibleModels ?? []).join(", ")} placeholder="Comma-separated, exactly as on the manufacturer's compatibility list" />
                <p className="help">Only models on the manufacturer’s published list. Admins check this against the datasheet; buyers see it as verified compatibility.</p>
              </div>
            </>
          ) : null}
          {category === "mounting" || category === "accessory" ? (
            <p className="text-sm text-muted sm:col-span-3">Describe dimensions and compatibility in the description.</p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Warranty and certification</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="warrantyProductYears" className="label">Product warranty (years)</label><input id="warrantyProductYears" name="warrantyProductYears" type="number" min={0} className="input" defaultValue={product?.warranty_product_years ?? ""} /></div>
          <div><label htmlFor="warrantyPerformanceYears" className="label">Performance warranty (years)</label><input id="warrantyPerformanceYears" name="warrantyPerformanceYears" type="number" min={0} className="input" defaultValue={product?.warranty_performance_years ?? ""} /></div>
          <div className="sm:col-span-2">
            <label htmlFor="warrantyBacker" className="label">Who honours the warranty in the Philippines</label>
            <input id="warrantyBacker" name="warrantyBacker" className="input" defaultValue={product?.warranty_backer ?? ""} placeholder="e.g. Your company as authorised distributor" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="certifications" className="label">Certifications</label>
            <input id="certifications" name="certifications" className="input" defaultValue={product?.certifications ?? ""} placeholder="e.g. IEC 61215, IEC 61730" />
            <p className="help">Upload supporting certificates under Documents on your profile. Admins check these before approval.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="datasheet" className="label">Datasheet (PDF, optional)</label>
            <input id="datasheet" name="datasheet" type="file" accept="application/pdf" className="block w-full text-sm" />
            {product?.datasheet_file_id ? <p className="help">A datasheet is already attached. Uploading a new one replaces it and sends the product for review.</p> : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="card card-pad">
        <legend className="px-1 text-lg font-semibold text-forest-deep">Price and availability</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="pricePhp" className="label">Buyer price (₱, optional)</label>
            <input id="pricePhp" name="pricePhp" type="number" min={0} step="0.01" className="input" defaultValue={product?.price_php ?? ""} />
            <p className="help">Shown publicly. Leave blank for “price on request”. Installer trade prices stay private in price requests.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="priceBasis" className="label">What the price covers</label>
            <select id="priceBasis" name="priceBasis" className="select" defaultValue={product?.price_basis ?? "equipment_only"}>
              <option value="equipment_only">Equipment only (pickup or delivery extra)</option>
              <option value="equipment_delivered">Equipment, delivered</option>
              <option value="supply_and_install">Supplied and installed</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="inclusions" className="label">Included in the price <span className="font-normal text-muted">(optional)</span></label>
            <input id="inclusions" name="inclusions" className="input" defaultValue={product?.inclusions ?? ""} placeholder="e.g. BMS, wall bracket, communication cable" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="exclusions" className="label">Not included <span className="font-normal text-muted">(optional)</span></label>
            <input id="exclusions" name="exclusions" className="input" defaultValue={product?.exclusions ?? ""} placeholder="e.g. delivery outside Metro Manila, installation" />
          </div>
          <div>
            <label htmlFor="unit" className="label">Per</label>
            <select id="unit" name="unit" className="select" defaultValue={product?.unit ?? "piece"}>
              <option value="piece">Piece</option><option value="set">Set</option><option value="kit">Kit</option><option value="meter">Metre</option>
            </select>
          </div>
          <div>
            <label htmlFor="leadTimeDays" className="label">Lead time (days)</label>
            <input id="leadTimeDays" name="leadTimeDays" type="number" min={0} className="input" defaultValue={product?.lead_time_days ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="stockStatus" className="label">Availability</label>
            <select id="stockStatus" name="stockStatus" className="select" defaultValue={product?.stock_status ?? "in_stock"}>
              <option value="in_stock">In stock</option><option value="made_to_order">Made to order</option><option value="out_of_stock">Out of stock</option>
            </select>
          </div>
        </div>
        <p className="help mt-3">Changing price, availability or lead time keeps an approved product live. Other changes send it back for review.</p>
      </fieldset>
    </ActionForm>
  );
}
