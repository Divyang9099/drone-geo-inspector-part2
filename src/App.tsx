import React from 'react'
import TopBar from './components/TopBar'
import FileManager from './components/FileManager'
import MapView from './components/MapView'
import HoverCard from './components/HoverCard'
import ImageLightbox from './components/ImageLightbox'
import MetadataModal from './components/MetadataModal'
import { useStore } from './store/useStore'
import './App.css'

const App: React.FC = () => {
  const showMetadataModal = useStore(s => s.showMetadataModal)

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-body">
        {/* Left: File Manager tree */}
        <div className="sidebar-wrapper">
          <FileManager />
        </div>

        {/* Right: Map (HoverCard is rendered inside map-wrapper) */}
        <main className="map-region">
          <MapView />
          <HoverCard />
        </main>
      </div>

      {/* Full-screen lightbox portal */}
      <ImageLightbox />

      {/* Metadata export modal */}
      {showMetadataModal && <MetadataModal />}
    </div>
  )
}

export default App
