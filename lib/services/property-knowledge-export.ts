const HEADERS = [
  "Client",
  "Internal Property Name",
  "Airbnb URL",
  "Airbnb Listing ID",
  "Status",
  "Completion %",
  "Listing Name",
  "Description",
  "Amenities",
  "Property Type",
  "Location",
  "Guest Capacity",
  "Bedrooms",
  "Bathrooms",
  "Beds",
  "Rules",
  "WiFi Name",
  "WiFi Password",
  "Door Code",
  "Parking Information",
  "Check-in Information",
  "Checkout Information",
  "Internal Notes",
];

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function propertyKnowledgeItemsToCsv(items: any[]) {
  const rows = items.map((item) => [
    item.client?.name,
    item.internalName,
    item.airbnbUrl,
    item.airbnbListingId,
    item.status,
    item.completionPct,
    item.listingName,
    item.description,
    item.amenities,
    item.propertyType,
    item.location,
    item.guestCapacity,
    item.bedrooms,
    item.bathrooms,
    item.beds,
    item.rules,
    item.wifiName,
    item.wifiPassword,
    item.doorCode,
    item.parkingInfo,
    item.checkInInfo,
    item.checkoutInfo,
    item.internalNotes,
  ]);

  return [HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
