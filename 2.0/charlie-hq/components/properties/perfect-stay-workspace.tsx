"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, priorityTone, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/shared/form-field";

type Property = any;
type Unit = any;
type Tenancy = any;
type Lead = any;
type Issue = any;
type Task = any;

const listingLevels = ["WHOLE_PROPERTY", "WHOLE_HOUSE", "PRIVATE_ROOM", "DETACHED_UNIT"];
const tenancyStatuses = ["CURRENT", "UPCOMING", "VACANT", "AIRBNB_TRANSITION"];

function fmtDate(value?: string | null) {
  if (!value) return "Open";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function money(value?: string | number | null) {
  if (value == null || value === "") return null;
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function textFromForm(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

async function submitJson(url: string, method: string, payload?: Record<string, any>) {
  const res = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Request failed");
  }
}

function DeleteButton({ url, label }: { url: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Delete ${label}?`)) return;
        setBusy(true);
        try {
          await submitJson(url, "DELETE");
          toast.success("Deleted");
          window.location.reload();
        } catch (err: any) {
          toast.error(err.message);
          setBusy(false);
        }
      }}
      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      aria-label={`Delete ${label}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function FormModal({
  title,
  trigger,
  children,
  onSubmit,
}: {
  title: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await onSubmit(new FormData(event.currentTarget));
              toast.success("Saved");
              setOpen(false);
              window.location.reload();
            } catch (err: any) {
              toast.error(err.message);
              setBusy(false);
            }
          }}
        >
          {children}
          <Button type="submit" disabled={busy} className="col-span-2">
            {busy ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IconEdit() {
  return (
    <button type="button" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
      <Pencil className="h-4 w-4" />
    </button>
  );
}

function PropertyModal({ clientId, existing }: { clientId: string; existing?: Property }) {
  return (
    <FormModal
      title={existing ? "Edit Property" : "Add Property"}
      trigger={existing ? <IconEdit /> : <Button><Plus className="h-4 w-4" /> Add Property</Button>}
      onSubmit={(form) =>
        submitJson(existing ? `/api/properties/${existing.id}` : "/api/properties", existing ? "PATCH" : "POST", {
          clientId,
          internalCode: textFromForm(form, "internalCode"),
          address: textFromForm(form, "address"),
          city: textFromForm(form, "city"),
          state: textFromForm(form, "state"),
          zip: textFromForm(form, "zip"),
          photosLink: textFromForm(form, "photosLink"),
          redfinLink: textFromForm(form, "redfinLink"),
          zillowLink: textFromForm(form, "zillowLink"),
          googleMapsLink: textFromForm(form, "googleMapsLink"),
          driveTimesNote: textFromForm(form, "driveTimesNote"),
          generalNotes: textFromForm(form, "generalNotes"),
        })
      }
    >
      <Field label="Code"><input name="internalCode" required defaultValue={existing?.internalCode ?? ""} className={inputClass} /></Field>
      <Field label="Address"><input name="address" required defaultValue={existing?.address ?? ""} className={inputClass} /></Field>
      <Field label="City"><input name="city" required defaultValue={existing?.city ?? ""} className={inputClass} /></Field>
      <Field label="State"><input name="state" required defaultValue={existing?.state ?? ""} className={inputClass} /></Field>
      <Field label="Zip"><input name="zip" defaultValue={existing?.zip ?? ""} className={inputClass} /></Field>
      <Field label="Photos Link"><input name="photosLink" defaultValue={existing?.photosLink ?? ""} className={inputClass} /></Field>
      <Field label="Redfin Link"><input name="redfinLink" defaultValue={existing?.redfinLink ?? ""} className={inputClass} /></Field>
      <Field label="Zillow Link"><input name="zillowLink" defaultValue={existing?.zillowLink ?? ""} className={inputClass} /></Field>
      <Field label="Google Maps"><input name="googleMapsLink" defaultValue={existing?.googleMapsLink ?? ""} className={inputClass} /></Field>
      <Field label="Drive Times" className="col-span-2"><textarea name="driveTimesNote" rows={2} defaultValue={existing?.driveTimesNote ?? ""} className={inputClass} /></Field>
      <Field label="Notes" className="col-span-2"><textarea name="generalNotes" rows={3} defaultValue={existing?.generalNotes ?? ""} className={inputClass} /></Field>
    </FormModal>
  );
}

function UnitModal({ properties, units, existing, propertyId }: { properties: Property[]; units: Unit[]; existing?: Unit; propertyId?: string }) {
  return (
    <FormModal
      title={existing ? "Edit Unit" : "Add Unit"}
      trigger={existing ? <IconEdit /> : <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Unit</Button>}
      onSubmit={(form) =>
        submitJson(existing ? `/api/units/${existing.id}` : "/api/units", existing ? "PATCH" : "POST", {
          propertyId: textFromForm(form, "propertyId"),
          parentUnitId: textFromForm(form, "parentUnitId"),
          internalName: textFromForm(form, "internalName"),
          listingLevel: textFromForm(form, "listingLevel"),
          bedBathConfig: textFromForm(form, "bedBathConfig"),
          bedType: textFromForm(form, "bedType"),
          hasSofaBed: form.get("hasSofaBed") === "on",
          thermostatLocation: textFromForm(form, "thermostatLocation"),
          parkingInfo: textFromForm(form, "parkingInfo"),
          petPolicy: textFromForm(form, "petPolicy"),
          hasTV: form.get("hasTV") === "" ? null : form.get("hasTV") === "true",
          airbnbLink: textFromForm(form, "airbnbLink"),
          vrboLink: textFromForm(form, "vrboLink"),
          amenitiesDocLink: textFromForm(form, "amenitiesDocLink"),
        })
      }
    >
      <Field label="Property">
        <select name="propertyId" required defaultValue={existing?.propertyId ?? propertyId ?? ""} className={inputClass}>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.internalCode}</option>)}
        </select>
      </Field>
      <Field label="Parent Unit">
        <select name="parentUnitId" defaultValue={existing?.parentUnitId ?? ""} className={inputClass}>
          <option value="">None</option>
          {units.filter((u) => u.id !== existing?.id).map((u) => <option key={u.id} value={u.id}>{u.internalName}</option>)}
        </select>
      </Field>
      <Field label="Name" className="col-span-2"><input name="internalName" required defaultValue={existing?.internalName ?? ""} className={inputClass} /></Field>
      <Field label="Listing Level">
        <select name="listingLevel" required defaultValue={existing?.listingLevel ?? "WHOLE_HOUSE"} className={inputClass}>
          {listingLevels.map((level) => <option key={level} value={level}>{level.replace(/_/g, " ")}</option>)}
        </select>
      </Field>
      <Field label="Bed/Bath"><input name="bedBathConfig" defaultValue={existing?.bedBathConfig ?? ""} className={inputClass} /></Field>
      <Field label="Bed Type"><input name="bedType" defaultValue={existing?.bedType ?? ""} className={inputClass} /></Field>
      <Field label="TV">
        <select name="hasTV" defaultValue={existing?.hasTV == null ? "" : String(existing.hasTV)} className={inputClass}>
          <option value="">Unknown</option><option value="true">Has TV</option><option value="false">No TV</option>
        </select>
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="hasSofaBed" defaultChecked={!!existing?.hasSofaBed} /> Sofa bed
      </label>
      <Field label="Thermostat" className="col-span-2"><input name="thermostatLocation" defaultValue={existing?.thermostatLocation ?? ""} className={inputClass} /></Field>
      <Field label="Parking" className="col-span-2"><input name="parkingInfo" defaultValue={existing?.parkingInfo ?? ""} className={inputClass} /></Field>
      <Field label="Pets" className="col-span-2"><input name="petPolicy" defaultValue={existing?.petPolicy ?? ""} className={inputClass} /></Field>
      <Field label="Airbnb"><input name="airbnbLink" defaultValue={existing?.airbnbLink ?? ""} className={inputClass} /></Field>
      <Field label="VRBO"><input name="vrboLink" defaultValue={existing?.vrboLink ?? ""} className={inputClass} /></Field>
      <Field label="Amenities Doc" className="col-span-2"><input name="amenitiesDocLink" defaultValue={existing?.amenitiesDocLink ?? ""} className={inputClass} /></Field>
    </FormModal>
  );
}

function TenancyModal({ units, existing, unitId }: { units: Unit[]; existing?: Tenancy; unitId?: string }) {
  return (
    <FormModal
      title={existing ? "Edit Tenancy" : "Add Tenancy"}
      trigger={existing ? <IconEdit /> : <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Tenancy</Button>}
      onSubmit={(form) =>
        submitJson(existing ? `/api/tenancies/${existing.id}` : "/api/tenancies", existing ? "PATCH" : "POST", {
          unitId: textFromForm(form, "unitId"),
          status: textFromForm(form, "status"),
          tenantName: textFromForm(form, "tenantName"),
          tenantContact: textFromForm(form, "tenantContact"),
          moveInDate: textFromForm(form, "moveInDate"),
          moveOutDate: textFromForm(form, "moveOutDate"),
          nextTenantName: textFromForm(form, "nextTenantName"),
          nextTenantMoveIn: textFromForm(form, "nextTenantMoveIn"),
          nextTenantMoveOut: textFromForm(form, "nextTenantMoveOut"),
          leaseSource: textFromForm(form, "leaseSource"),
          rentAmount: textFromForm(form, "rentAmount"),
          securityDeposit: textFromForm(form, "securityDeposit"),
          cleaningFee: textFromForm(form, "cleaningFee"),
          petFee: textFromForm(form, "petFee"),
          utilitiesNote: textFromForm(form, "utilitiesNote"),
          parkingNote: textFromForm(form, "parkingNote"),
          amountDue: textFromForm(form, "amountDue"),
          notes: textFromForm(form, "notes"),
        })
      }
    >
      <Field label="Unit">
        <select name="unitId" required defaultValue={existing?.unitId ?? unitId ?? ""} className={inputClass}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.internalName}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select name="status" required defaultValue={existing?.status ?? "CURRENT"} className={inputClass}>
          {tenancyStatuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </Field>
      <Field label="Tenant"><input name="tenantName" defaultValue={existing?.tenantName ?? ""} className={inputClass} /></Field>
      <Field label="Contact"><input name="tenantContact" defaultValue={existing?.tenantContact ?? ""} className={inputClass} /></Field>
      <Field label="Move In"><input type="date" name="moveInDate" defaultValue={dateInput(existing?.moveInDate)} className={inputClass} /></Field>
      <Field label="Move Out"><input type="date" name="moveOutDate" defaultValue={dateInput(existing?.moveOutDate)} className={inputClass} /></Field>
      <Field label="Next Tenant"><input name="nextTenantName" defaultValue={existing?.nextTenantName ?? ""} className={inputClass} /></Field>
      <Field label="Next Move In"><input type="date" name="nextTenantMoveIn" defaultValue={dateInput(existing?.nextTenantMoveIn)} className={inputClass} /></Field>
      <Field label="Next Move Out"><input type="date" name="nextTenantMoveOut" defaultValue={dateInput(existing?.nextTenantMoveOut)} className={inputClass} /></Field>
      <Field label="Lease Source"><input name="leaseSource" defaultValue={existing?.leaseSource ?? ""} className={inputClass} /></Field>
      <Field label="Rent"><input type="number" step="0.01" name="rentAmount" defaultValue={existing?.rentAmount ?? ""} className={inputClass} /></Field>
      <Field label="Deposit"><input type="number" step="0.01" name="securityDeposit" defaultValue={existing?.securityDeposit ?? ""} className={inputClass} /></Field>
      <Field label="Cleaning Fee"><input type="number" step="0.01" name="cleaningFee" defaultValue={existing?.cleaningFee ?? ""} className={inputClass} /></Field>
      <Field label="Pet Fee"><input type="number" step="0.01" name="petFee" defaultValue={existing?.petFee ?? ""} className={inputClass} /></Field>
      <Field label="Amount Due"><input type="number" step="0.01" name="amountDue" defaultValue={existing?.amountDue ?? ""} className={inputClass} /></Field>
      <Field label="Utilities"><input name="utilitiesNote" defaultValue={existing?.utilitiesNote ?? ""} className={inputClass} /></Field>
      <Field label="Parking Note" className="col-span-2"><input name="parkingNote" defaultValue={existing?.parkingNote ?? ""} className={inputClass} /></Field>
      <Field label="Notes" className="col-span-2"><textarea name="notes" rows={3} defaultValue={existing?.notes ?? ""} className={inputClass} /></Field>
    </FormModal>
  );
}

function LeadModal({ clientId, units, existing }: { clientId: string; units: Unit[]; existing?: Lead }) {
  return (
    <FormModal
      title={existing ? "Edit Lead" : "Add Lead"}
      trigger={existing ? <IconEdit /> : <Button><Plus className="h-4 w-4" /> Add Lead</Button>}
      onSubmit={(form) =>
        submitJson(existing ? `/api/leads/${existing.id}` : "/api/leads", existing ? "PATCH" : "POST", {
          clientId,
          interestedUnitId: textFromForm(form, "interestedUnitId"),
          name: textFromForm(form, "name"),
          channel: textFromForm(form, "channel"),
          status: textFromForm(form, "status"),
          contactedDate: textFromForm(form, "contactedDate"),
          notes: textFromForm(form, "notes"),
        })
      }
    >
      <Field label="Name"><input name="name" required defaultValue={existing?.name ?? ""} className={inputClass} /></Field>
      <Field label="Channel"><input name="channel" required defaultValue={existing?.channel ?? "Facebook"} className={inputClass} /></Field>
      <Field label="Status"><input name="status" required defaultValue={existing?.status ?? "Sent a message"} className={inputClass} /></Field>
      <Field label="Contacted"><input type="date" name="contactedDate" defaultValue={dateInput(existing?.contactedDate)} className={inputClass} /></Field>
      <Field label="Interested Unit" className="col-span-2">
        <select name="interestedUnitId" defaultValue={existing?.interestedUnitId ?? ""} className={inputClass}>
          <option value="">None</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.internalName}</option>)}
        </select>
      </Field>
      <Field label="Notes" className="col-span-2"><textarea name="notes" rows={3} defaultValue={existing?.notes ?? ""} className={inputClass} /></Field>
    </FormModal>
  );
}

function LinkPill({ href, children }: { href?: string | null; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary">
      {children}<ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function PerfectStayWorkspace({
  client,
  properties,
  leads,
  issues,
  recurringTasks,
  canManage,
}: {
  client: any;
  properties: Property[];
  leads: Lead[];
  issues: Issue[];
  recurringTasks: Task[];
  canManage: boolean;
}) {
  const [openProperties, setOpenProperties] = useState<string[]>(properties.map((p) => p.id));
  const [showAllLeads, setShowAllLeads] = useState(false);
  const allUnits = useMemo(() => properties.flatMap((p) => p.units), [properties]);
  const issuesByProperty = useMemo(() => {
    return issues.reduce<Record<string, Issue[]>>((groups, issue) => {
      const key = issue.unit?.property?.internalCode ?? "General";
      groups[key] = [...(groups[key] ?? []), issue];
      return groups;
    }, {});
  }, [issues]);
  const now = new Date();
  const attention = allUnits.filter((unit) => {
    const latest = unit.tenancies?.[0];
    if (!latest) return true;
    if (latest.status === "VACANT" || latest.status === "AIRBNB_TRANSITION") return true;
    if (latest.moveOutDate && !latest.nextTenantName) {
      const days = (new Date(latest.moveOutDate).getTime() - now.getTime()) / 86400000;
      return days >= 0 && days <= 30;
    }
    return false;
  });
  const visibleLeads = showAllLeads ? leads : leads.slice(0, 20);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Needs Attention</CardTitle>
          <Badge tone={attention.length ? "warning" : "success"}>{attention.length} units</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vacancy or turnover items flagged.</p>
          ) : (
            attention.map((unit) => {
              const latest = unit.tenancies?.[0];
              return (
                <div key={unit.id} className="rounded-lg border border-border/70 p-3">
                  <p className="font-medium">{unit.internalName}</p>
                  <p className="text-xs text-muted-foreground">{properties.find((p) => p.id === unit.propertyId)?.internalCode}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={statusTone(latest?.status ?? "VACANT")}>{(latest?.status ?? "VACANT").replace(/_/g, " ")}</Badge>
                    {latest?.moveOutDate && <Badge tone="neutral">Out {fmtDate(latest.moveOutDate)}</Badge>}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Properties</h2>
        {canManage && <PropertyModal clientId={client.id} />}
      </div>

      {properties.map((property) => {
        const expanded = openProperties.includes(property.id);
        return (
          <Card key={property.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setOpenProperties((prev) => expanded ? prev.filter((id) => id !== property.id) : [...prev, property.id])}
                className="flex min-w-0 items-start gap-2 text-left"
              >
                <ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                <span>
                  <CardTitle>{property.internalCode}</CardTitle>
                  <span className="mt-1 block text-xs text-muted-foreground">{property.address}, {property.city}, {property.state} {property.zip}</span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <LinkPill href={property.photosLink}>Photos</LinkPill>
                <LinkPill href={property.googleMapsLink}>Map</LinkPill>
                {canManage && <PropertyModal clientId={client.id} existing={property} />}
                {canManage && <DeleteButton url={`/api/properties/${property.id}`} label={property.internalCode} />}
              </div>
            </CardHeader>
            {expanded && (
              <CardContent className="space-y-4">
                {(property.driveTimesNote || property.generalNotes) && (
                  <p className="text-xs leading-5 text-muted-foreground">{[property.driveTimesNote, property.generalNotes].filter(Boolean).join(" · ")}</p>
                )}
                <div className="flex justify-end">{canManage && <UnitModal properties={properties} units={allUnits} propertyId={property.id} />}</div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {property.units.map((unit: Unit) => {
                    const tenancies = unit.tenancies ?? [];
                    const current = tenancies[0];
                    const parent = allUnits.find((candidate) => candidate.id === unit.parentUnitId);
                    return (
                      <div key={unit.id} className="rounded-lg border border-border/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{unit.internalName}</p>
                            <p className="text-xs text-muted-foreground">
                              {unit.listingLevel.replace(/_/g, " ")}{parent ? ` · under ${parent.internalName}` : ""}{unit.bedBathConfig ? ` · ${unit.bedBathConfig}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {canManage && <UnitModal properties={properties} units={allUnits} existing={unit} />}
                            {canManage && <DeleteButton url={`/api/units/${unit.id}`} label={unit.internalName} />}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {unit.bedType && <span>{unit.bedType}</span>}
                          {unit.thermostatLocation && <span>Thermostat: {unit.thermostatLocation}</span>}
                          {unit.parkingInfo && <span>Parking: {unit.parkingInfo}</span>}
                          {unit.petPolicy && <span>Pets: {unit.petPolicy}</span>}
                          {unit.hasTV != null && <span>{unit.hasTV ? "TV" : "No TV"}</span>}
                          {unit.hasSofaBed && <span>Sofa bed</span>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <LinkPill href={unit.airbnbLink}>Airbnb</LinkPill>
                          <LinkPill href={unit.vrboLink}>VRBO</LinkPill>
                          <LinkPill href={unit.amenitiesDocLink}>Amenities</LinkPill>
                        </div>
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenancy</p>
                            {canManage && <TenancyModal units={allUnits} unitId={unit.id} />}
                          </div>
                          {tenancies.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No tenancy records.</p>
                          ) : tenancies.map((tenancy: Tenancy) => (
                            <div key={tenancy.id} className="rounded-lg bg-muted/30 p-3 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge tone={statusTone(tenancy.status)}>{tenancy.status.replace(/_/g, " ")}</Badge>
                                    <span className="font-medium">{tenancy.tenantName ?? "No tenant named"}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {fmtDate(tenancy.moveInDate)} - {fmtDate(tenancy.moveOutDate)}
                                    {money(tenancy.rentAmount) ? ` · Rent ${money(tenancy.rentAmount)}` : ""}
                                    {money(tenancy.securityDeposit) ? ` · Deposit ${money(tenancy.securityDeposit)}` : ""}
                                    {money(tenancy.amountDue) ? ` · Due ${money(tenancy.amountDue)}` : ""}
                                  </p>
                                  {tenancy.notes && <p className="mt-1 text-xs text-muted-foreground">{tenancy.notes}</p>}
                                </div>
                                <div className="flex items-center gap-1">
                                  {canManage && <TenancyModal units={allUnits} existing={tenancy} />}
                                  {canManage && <DeleteButton url={`/api/tenancies/${tenancy.id}`} label="tenancy" />}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Leads</CardTitle>
          {canManage && <LeadModal clientId={client.id} units={allUnits} />}
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleLeads.map((lead) => (
            <div key={lead.id} className="grid grid-cols-12 items-center gap-3 border-t border-border/60 py-2 text-sm first:border-0">
              <div className="col-span-3 font-medium">{lead.name}</div>
              <div className="col-span-2 text-muted-foreground">{lead.channel}</div>
              <div className="col-span-2">{lead.status}</div>
              <div className="col-span-3 text-xs text-muted-foreground">{lead.notes ?? lead.interestedUnit?.internalName ?? ""}</div>
              <div className="col-span-2 flex justify-end gap-1">
                {canManage && <LeadModal clientId={client.id} units={allUnits} existing={lead} />}
                {canManage && <DeleteButton url={`/api/leads/${lead.id}`} label={lead.name} />}
              </div>
            </div>
          ))}
          {leads.length > 20 && (
            <button type="button" onClick={() => setShowAllLeads((v) => !v)} className="text-xs text-primary hover:underline">
              {showAllLeads ? "Show fewer" : `View all ${leads.length}`}
            </button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Maintenance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(issuesByProperty).map(([propertyName, propertyIssues]) => (
              <div key={propertyName} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{propertyName}</p>
                  <div className="flex gap-2">
                    <Badge tone="danger">{propertyIssues.filter((issue) => issue.status !== "RESOLVED").length} open</Badge>
                    <Badge tone="success">{propertyIssues.filter((issue) => issue.status === "RESOLVED").length} resolved</Badge>
                  </div>
                </div>
                {propertyIssues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{issue.title}</p>
                      <p className="text-xs text-muted-foreground">{issue.unit?.internalName ?? "General"}</p>
                    </div>
                    <Badge tone={statusTone(issue.status)}>{issue.status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recurring Tasks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recurringTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between border-t border-border/60 py-2 text-sm first:border-0">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.category?.name ?? "Uncategorized"} · {task.repeatMode}</p>
                </div>
                <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
