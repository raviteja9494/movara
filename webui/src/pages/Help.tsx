export function Help() {
  return (
    <div className="page">
      <section className="page-section">
        <h2 className="page-heading">Help</h2>
        <p className="page-subheading">A short guide to using Movara.</p>

        <div className="card" style={{ maxWidth: '560px' }}>
          <div className="card-title">What is Movara?</div>
          <p className="card-meta" style={{ marginBottom: '0.5rem' }}>
            Movara tracks your vehicles, trips, fuel, and maintenance in one place. You can link a GPS device to a vehicle and see trips from device data, or add trips by importing GPX files.
          </p>
        </div>

        <div className="card" style={{ maxWidth: '560px', marginTop: '1rem' }}>
          <div className="card-title">First steps</div>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
            <li>Add a vehicle (Vehicles → Add vehicle).</li>
            <li>Optionally link a device to the vehicle (Devices → add device, then link on the vehicle).</li>
            <li>Add fuel logs and maintenance from the vehicle page or Maintenance.</li>
            <li>View or create trips under Trips (from device data or by importing a GPX file).</li>
          </ol>
        </div>

        <div className="card" style={{ maxWidth: '560px', marginTop: '1rem' }}>
          <div className="card-title">Sections</div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
            <li><strong>Overview</strong> — Dashboard summary.</li>
            <li><strong>Tracking</strong> — Live map and last positions from linked devices.</li>
            <li><strong>Vehicles</strong> — List and details: odometer, photo, fuel, maintenance, linked device.</li>
            <li><strong>Trips</strong> — List and detail: create from device time range, import GPX, or delete.</li>
            <li><strong>Devices</strong> — GPS devices; link one to a vehicle to use its trips and tracking.</li>
            <li><strong>Maintenance</strong> — Service records by vehicle; optional receipt (image or PDF, max 1 MB).</li>
            <li><strong>Settings</strong> — Units, API URL, and Database: export backup, import backup, or clear all data (requires typing CLEAR).</li>
          </ul>
        </div>

        <div className="card" style={{ maxWidth: '560px', marginTop: '1rem' }}>
          <div className="card-title">Uploads</div>
          <p className="card-meta" style={{ margin: 0 }}>
            Vehicle photos and maintenance receipts are limited to <strong>1 MB</strong>. If upload fails or the file is too large, use a smaller or compressed image.
          </p>
        </div>
      </section>
    </div>
  );
}
