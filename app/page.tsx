export default function Home() {
  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <h1>Mechanics Workspace</h1>
        </div>

        <div className="sidebarSection">
          <p className="sectionLabel">Tools</p>
          <p className="sidebarHint">Your diagram tools will live here.</p>
        </div>
      </aside>

      <section className="canvas" aria-label="Free body diagram canvas">
        <div className="canvasOrigin" />
      </section>
    </main>
  );
}
