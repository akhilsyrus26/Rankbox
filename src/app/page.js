'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const CustomDropdown = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeLabel = options.find(o => o.value === value)?.label || "Select...";

  return (
    <div className="custom-dropdown-container">
      <button type="button" className="custom-dropdown-button" onClick={() => setIsOpen(!isOpen)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLabel}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '10px' }}>▼</span>
      </button>
      {isOpen && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setIsOpen(false)} />
          <div className="custom-dropdown-menu">
            {options.map((opt, idx) => (
              <button 
                key={idx}
                type="button" 
                className={`custom-dropdown-item ${opt.isAction ? 'action-item' : ''}`}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default function Home() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('discover'); // 'discover', 'log', 'social'
  
  // Auth State
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Data State
  const [myShows, setMyShows] = useState([]);
  const [discoverResults, setDiscoverResults] = useState([]);
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState('');
  
  // Collections State
  const [activeCollection, setActiveCollection] = useState(null);
  
  // Social State
  const [socialSearch, setSocialSearch] = useState('');
  const [socialUsers, setSocialUsers] = useState([]);
  const [socialShows, setSocialShows] = useState([]);
  const [activeSocialUser, setActiveSocialUser] = useState(null);
  const [activeSettingsMenu, setActiveSettingsMenu] = useState(null);
  const [primaryTab, setPrimaryTab] = useState('all');
  const [secondaryTab, setSecondaryTab] = useState('all');
  
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItem, setCustomItem] = useState({ title: '', type: 'Anime', cover_url: '', description: '' });
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const watchCategories = [...new Set(myShows.filter(s => s.category && s.category.startsWith('custom_watch:')).map(s => s.category.replace('custom_watch:', '')))];
  const readCategories = [...new Set(myShows.filter(s => s.category && s.category.startsWith('custom_read:')).map(s => s.category.replace('custom_read:', '')))];

  useEffect(() => {
    // Strict session check on load
    const checkSession = async () => {
      try {
        const fetchSession = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            let finalUsername = 'User';
            if (profile) {
              finalUsername = profile.username;
            } else {
              // Auto-heal missing profile from bot wipe
              finalUsername = session.user.email.split('@')[0];
              await supabase.from('profiles').insert([{ id: session.user.id, username: finalUsername }]);
            }
            setCurrentUser({ id: session.user.id, email: session.user.email, username: finalUsername });
            fetchMyShows(session.user.id);
            setCurrentView('discover');
            loadDefaultTrending();
          }
        };

        await Promise.race([
          fetchSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
      } catch (err) {
        console.error("Session check timed out or failed:", err);
        await supabase.auth.signOut().catch(() => {});
      }
    };
    checkSession();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!username.trim() || !password) {
      setAuthError('Please fill in all fields.');
      return;
    }

    const pseudoEmail = `${username.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}@rankboxapp.com`;
    setIsAuthLoading(true);

    const withTimeout = (promise, ms = 8000) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout. Please check your connection.')), ms))
      ]);
    };

    try {
      if (authMode === 'register') {
        const { data, error } = await withTimeout(supabase.auth.signUp({ email: pseudoEmail, password }));
        if (error) throw error;
        
        if (data.user) {
          const { error: profileError } = await withTimeout(supabase.from('profiles').insert([{ id: data.user.id, username: username.trim() }]));
          if (profileError) {
            await supabase.auth.signOut();
            throw new Error('Username might already be taken.');
          } else {
            setCurrentUser({ id: data.user.id, email: data.user.email, username: username.trim() });
            fetchMyShows(data.user.id);
            setCurrentView('discover');
            loadDefaultTrending();
          }
        }
      } else {
        const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email: pseudoEmail, password }));
        if (error) throw error;
        
        const { data: profile } = await withTimeout(supabase.from('profiles').select('*').eq('id', data?.user?.id).single());
        let finalUsername = username.trim();
        if (!profile) {
          // Auto-heal missing profile from bot wipe
          await withTimeout(supabase.from('profiles').insert([{ id: data.user.id, username: finalUsername }]));
        } else {
          finalUsername = profile.username;
        }
        
        setCurrentUser({ id: data.user.id, email: data.user.email, username: finalUsername });
        fetchMyShows(data.user.id);
        setCurrentView('discover');
        loadDefaultTrending();
      }
    } catch (error) {
      console.error("Auth Error:", error);
      if (error.message.includes('timeout')) {
        await supabase.auth.signOut().catch(() => {});
      }
      setAuthError(error.message);
      alert(error.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- API FETCHING ---
  const handleCreateCustomItem = async (e) => {
    e.preventDefault();
    if (!customItem.title.trim()) return;
    const apiId = `custom_${Date.now()}`;
    const categoryName = customItem.type.toLowerCase();
    
    let pTab = 'watch';
    if (categoryName === 'manga' || categoryName === 'book') pTab = 'read';

    const { error } = await supabase.from('shows').insert([{
      user_id: currentUser.id,
      api_id: apiId,
      title: customItem.title,
      type: customItem.type,
      description: customItem.description || 'Custom added item',
      image: customItem.cover_url || '/placeholder.png',
      rating: null,
      status: 'watching',
      category: categoryName
    }]);

    if (!error) {
      setShowCustomModal(false);
      setCustomItem({ title: '', type: 'Anime', cover_url: '', description: '' });
      fetchMyShows(currentUser.id);
      setPrimaryTab(pTab);
      setCurrentView('log');
    }
  };

  const fetchMyShows = async (userId) => {
    const { data, error } = await supabase.from('shows').select('*').eq('user_id', userId);
    if (!error && data) setMyShows(data);
  };

  const loadDefaultTrending = async () => {
    setIsDiscoverLoading(true);
    try {
      const [jikanRes, tvmazeRes, jikanMangaRes] = await Promise.allSettled([
        fetch('https://api.jikan.moe/v4/top/anime?limit=8'),
        fetch('https://api.tvmaze.com/shows'),
        fetch('https://api.jikan.moe/v4/top/manga?limit=8')
      ]);

      let animeResults = [];
      let tvResults = [];
      let mangaResults = [];

      if (jikanRes.status === 'fulfilled') {
        const jikanData = await jikanRes.value.json();
        animeResults = (jikanData.data || []).map(anime => ({
          api_id: `anime_${anime.mal_id}`, title: anime.title,
          image: anime.images?.jpg?.image_url || 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Image', 
          type: 'Anime', category: 'anime',
          description: anime.synopsis || "No description available.",
          popularity: anime.members || 0
        }));
      }

      if (tvmazeRes.status === 'fulfilled') {
        const tvmazeData = await tvmazeRes.value.json();
        tvResults = (tvmazeData || []).slice(0, 8).map(show => ({
          api_id: `tv_${show.id}`, title: show.name,
          image: show.image ? show.image.medium : 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Image',
          type: 'TV/Movie', category: 'tv',
          description: show.summary ? show.summary.replace(/<[^>]+>/g, '') : "No description available.",
          popularity: show.weight * 10000
        }));
      }

      if (jikanMangaRes.status === 'fulfilled') {
        const mangaData = await jikanMangaRes.value.json();
        mangaResults = (mangaData.data || []).map(manga => ({
          api_id: `manga_${manga.mal_id}`, title: manga.title,
          image: manga.images?.jpg?.image_url || 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Image', 
          type: 'Manga', category: 'manga',
          description: manga.synopsis || "No description available.",
          popularity: manga.members || 0
        }));
      }

      const combined = [...animeResults, ...tvResults, ...mangaResults].sort((a, b) => b.popularity - a.popularity);
      setDiscoverResults(combined);
    } catch(err) {
      console.error(err);
    }
    setIsDiscoverLoading(false);
  };

  const handleUnifiedSearch = async () => {
    if (!discoverQuery.trim()) return loadDefaultTrending();
    setIsDiscoverLoading(true);
    try {
      const [jikanRes, tvmazeRes, jikanMangaRes, openLibRes] = await Promise.allSettled([
        fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(discoverQuery)}&limit=10`),
        fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(discoverQuery)}`),
        fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(discoverQuery)}&limit=10`),
        fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(discoverQuery)}&limit=10`)
      ]);

      let animeResults = [];
      let tvResults = [];
      let mangaResults = [];
      let bookResults = [];

      if (jikanRes.status === 'fulfilled') {
        const jikanData = await jikanRes.value.json();
        animeResults = (jikanData.data || []).map(anime => ({
          api_id: `anime_${anime.mal_id}`, title: anime.title, 
          image: anime.images?.jpg?.image_url || 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Image',
          type: 'Anime', category: 'anime', description: anime.synopsis || "No description available.",
          popularity: anime.members || 0
        }));
      }

      if (tvmazeRes.status === 'fulfilled') {
        const tvmazeData = await tvmazeRes.value.json();
        tvResults = (tvmazeData || []).slice(0, 10).map(item => ({
          api_id: `tv_${item.show.id}`, title: item.show.name,
          image: item.show.image ? item.show.image.medium : 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Image',
          type: 'TV/Movie', category: 'tv', description: item.show.summary ? item.show.summary.replace(/<[^>]+>/g, '') : "No description available.",
          popularity: item.score ? item.score * 100000 : 0
        }));
      }

      if (jikanMangaRes.status === 'fulfilled') {
        const jikanMangaData = await jikanMangaRes.value.json();
        mangaResults = (jikanMangaData.data || []).map(manga => ({
          api_id: `manga_${manga.mal_id}`, title: manga.title, 
          image: manga.images?.jpg?.image_url || 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Image',
          type: 'Manga', category: 'manga', description: manga.synopsis || "No description available.",
          popularity: manga.members || 0
        }));
      }

      if (openLibRes.status === 'fulfilled') {
        const openLibData = await openLibRes.value.json();
        bookResults = (openLibData.docs || []).filter(doc => doc.title).map(doc => ({
          api_id: `book_${doc.key.replace('/works/', '')}`, 
          title: doc.title,
          image: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : 'https://via.placeholder.com/210x295/000000/FFFFFF?text=No+Cover',
          type: 'Book/Novel', category: 'book',
          description: doc.author_name ? `Author: ${doc.author_name.join(', ')}` : "No author information.",
          popularity: doc.edition_count ? doc.edition_count * 1000 : 0
        }));
      }

      let combined = [...animeResults, ...tvResults, ...mangaResults, ...bookResults];
      combined.forEach(show => { if (show.title.toLowerCase() === discoverQuery.toLowerCase()) show.popularity += 10000000; });
      combined.sort((a, b) => b.popularity - a.popularity);
      
      setDiscoverResults(combined.slice(0, 30));
    } catch (err) {
      console.error(err);
    }
    setIsDiscoverLoading(false);
  };

  // --- SHOW ACTIONS ---
  const addShow = async (show) => {
    if (myShows.find(s => s.api_id === show.api_id)) return;
    const { error } = await supabase.from('shows').insert([{
      user_id: currentUser.id, api_id: show.api_id, title: show.title,
      image: show.image, type: show.type, category: show.category,
      description: show.description, rating: null, collection_name: null
    }]);
    if (error) {
        alert("Error adding show: " + error.message);
        console.error(error);
    } else {
        fetchMyShows(currentUser.id);
    }
  };

  const updateRating = async (id, value) => {
    let numVal = parseFloat(value);
    numVal = isNaN(numVal) ? null : Math.round(Math.min(Math.max(numVal, 1), 10) * 10) / 10;
    
    // Optimistic UI update
    setMyShows(prev => prev.map(s => s.id === id ? { ...s, rating: numVal } : s));
    setSocialShows(prev => prev.map(s => s.id === id ? { ...s, rating: numVal } : s));
    
    const { error } = await supabase.from('shows').update({ rating: numVal }).eq('id', id);
    if (error) alert("Error updating rating: " + error.message);
  };

  const removeShow = async (id) => {
    setMyShows(prev => prev.filter(s => s.id !== id));
    await supabase.from('shows').delete().eq('id', id);
  };

  const addToCollection = async (id, name) => {
    setMyShows(prev => prev.map(s => s.id === id ? { ...s, collection_name: name } : s));
    const { error } = await supabase.from('shows').update({ collection_name: name }).eq('id', id);
    if (error) alert("Error adding to collection: " + error.message);
  };

  const setCollectionCover = async (collectionName, showId) => {
    // Optimistic update
    setMyShows(prev => prev.map(s => {
        if (s.collection_name && s.collection_name.trim().toLowerCase() === collectionName.toLowerCase()) {
            return { ...s, is_collection_cover: s.id === showId };
        }
        return s;
    }));
    
    // We update all shows in this collection to not be the cover, then set the specific one to true
    await supabase.from('shows').update({ is_collection_cover: false }).ilike('collection_name', collectionName);
    const { error } = await supabase.from('shows').update({ is_collection_cover: true }).eq('id', showId);
    
    if (error) alert("Database error setting cover (you may need to run the SQL command first): " + error.message);
  };

  const setCustomCategory = async (id, newCategory) => {
    setMyShows(prev => prev.map(s => s.id === id ? { ...s, category: newCategory } : s));
    const { error } = await supabase.from('shows').update({ category: newCategory }).eq('id', id);
    if (error) alert("Error setting category: " + error.message);
  };

  // --- SOCIAL ACTIONS ---
  const [socialError, setSocialError] = useState(null);

  const handleSocialSearch = async () => {
    if (!socialSearch.trim()) return;
    setSocialError(null);
    const { data, error } = await supabase.from('profiles').select('*').ilike('username', `%${socialSearch.trim()}%`).limit(20);
    if (error) {
      setSocialError(error.message);
    }
    setSocialUsers(data || []);
    setActiveSocialUser(null);
  };

  const viewUserLog = async (user) => {
    if (user.id === currentUser.id) {
        setCurrentView('log');
        return;
    }
    setActiveSocialUser(user);
    setActiveCollection(null); // Reset collection view
    const { data } = await supabase.from('shows').select('*').eq('user_id', user.id);
    setSocialShows(data || []);
  };

  // --- RENDER HELPERS ---
  const renderCards = (showsList, isInteractive) => {
    if (showsList.length === 0) return <div className="loader">No shows to display.</div>;

    const standalone = [];
    const collections = {};
    const originalNames = {};

    showsList.forEach(show => {
        if (show.collection_name && show.collection_name.trim() !== "") {
            const normalized = show.collection_name.trim().toLowerCase();
            if (!collections[normalized]) {
                collections[normalized] = [];
                originalNames[normalized] = show.collection_name.trim();
            }
            collections[normalized].push(show);
        } else {
            standalone.push(show);
        }
    });

    if (activeCollection && collections[activeCollection]) {
        return (
            <>
                <div style={{ gridColumn: '1 / -1', marginBottom: '1rem' }}>
                    <button className="btn-secondary" onClick={() => setActiveCollection(null)}>← Back to All Shows</button>
                </div>
                <h2 style={{ gridColumn: '1 / -1' }}>📁 {originalNames[activeCollection]} Collection</h2>
                {collections[activeCollection].map(show => (
                    <div key={show.id} style={{ position: 'relative' }}>
                        <ShowCard show={show} isInteractive={isInteractive} />
                        {isInteractive && (
                            <button 
                                onClick={() => setCollectionCover(activeCollection, show.id)}
                                style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: show.is_collection_cover ? 'var(--accent-primary)' : 'rgba(0,0,0,0.7)', color: 'white', border: '1px solid var(--accent-primary)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
                            >
                                {show.is_collection_cover ? '★ Cover Image' : 'Set as Cover'}
                            </button>
                        )}
                    </div>
                ))}
            </>
        );
    }

    return (
        <>
            {Object.keys(collections).map(normalized => {
                const colName = originalNames[normalized];
                const coverShow = collections[normalized].find(s => s.is_collection_cover) || collections[normalized][0];
                const coverImage = coverShow.image;
                
                return (
                <div key={normalized} className="card" style={{ cursor: 'pointer', position: 'relative' }} onClick={() => setActiveCollection(normalized)}>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--accent-primary)', color: 'white', padding: '6px 12px', borderRadius: '12px', fontWeight: '800', zIndex: 10, fontSize: '0.85rem', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                        {collections[normalized].length} Items
                    </div>
                    <img className="card-img" src={coverImage} alt={colName} />
                    <div className="card-content">
                        <h3 className="card-title">{colName}</h3>
                        <span className="card-type" style={{ color: 'var(--accent-secondary)' }}>Collection Folder</span>
                        <div className="card-desc">Featuring: {coverShow.title}</div>
                    </div>
                </div>
                );
            })}
            {standalone.map(show => <ShowCard key={show.id} show={show} isInteractive={isInteractive} />)}
        </>
    );
  };

  const ShowCard = ({ show, isInteractive }) => {
    const existingFolders = Array.from(new Set(myShows.map(s => s.collection_name).filter(Boolean)));

    return (
      <div className="card">
        <img className="card-img" src={show.image || '/placeholder.png'} alt={show.title} onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder.png'; }} />
        <div className="card-content">
          <h3 className="card-title">{show.title}</h3>
          <span className="card-type">{show.type}</span>
          <div className="card-desc" dangerouslySetInnerHTML={{ __html: show.description }}></div>
          
          {isInteractive ? (
             <>
               <div className="rating-pill">
                 <span className="rating-pill-label">Rating</span>
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <select 
                        className={`rating-select ${show.rating !== null && Math.floor(show.rating) === 10 ? 'is-ten' : ''}`} 
                        value={show.rating !== null ? Math.floor(show.rating) : ''} 
                        onChange={(e) => {
                            const whole = e.target.value;
                            if (!whole) return updateRating(show.id, null);
                            if (whole === '10') return updateRating(show.id, 10.0);
                            const dec = show.rating !== null ? Math.round((show.rating - Math.floor(show.rating)) * 10) : 0;
                            updateRating(show.id, parseFloat(`${whole}.${dec}`));
                        }}
                     >
                        <option value="" disabled>-</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                     </select>
                     {show.rating !== null && Math.floor(show.rating) !== 10 && (
                         <select 
                            className="rating-select decimal" 
                            value={Math.round((show.rating - Math.floor(show.rating)) * 10)} 
                            onChange={(e) => {
                                const dec = e.target.value;
                                const whole = Math.floor(show.rating);
                                updateRating(show.id, parseFloat(`${whole}.${dec}`));
                            }}
                         >
                            {[0,1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>.{n}</option>)}
                         </select>
                     )}
                 </div>
                 <span className="rating-pill-max">/10</span>
               </div>
               <div className="card-actions" style={{ position: 'relative' }}>
                 <button 
                    className="btn-small" 
                    style={{ width: '100%', background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}
                    onClick={() => setActiveSettingsMenu(activeSettingsMenu === show.id ? null : show.id)}
                 >
                    ⚙️ Settings
                 </button>
                 {activeSettingsMenu === show.id && (
                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-color)', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-primary)', marginTop: '5px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                         <CustomDropdown 
                             value={show.collection_name || "none"}
                             options={[
                                { value: 'none', label: 'No Folder' },
                                ...existingFolders.map(folder => ({ value: folder, label: `📁 ${folder}` })),
                                { value: 'new', label: '+ Create New Folder', isAction: true }
                             ]}
                             onChange={(val) => {
                                 if (val === 'none') {
                                     addToCollection(show.id, ""); 
                                 } else if (val === 'new') {
                                     const name = window.prompt("Enter new folder name:");
                                     if (name && name.trim()) addToCollection(show.id, name.trim());
                                 } else {
                                     addToCollection(show.id, val);
                                 }
                                 setActiveSettingsMenu(null);
                             }}
                         />
                         {(() => {
                             const isWatch = show.api_id.startsWith('anime_') || show.api_id.startsWith('tv_');
                             const customList = isWatch ? watchCategories : readCategories;
                             const prefix = isWatch ? 'custom_watch:' : 'custom_read:';
                             const defaultCat = show.api_id.startsWith('anime_') ? 'anime' : show.api_id.startsWith('tv_') ? 'tv' : show.api_id.startsWith('manga_') ? 'manga' : 'book';
                             return (
                                 <CustomDropdown 
                                     value={show.category.startsWith('custom_') ? show.category : "default"}
                                     options={[
                                        { value: 'default', label: 'Default Category' },
                                        ...customList.map(cat => ({ value: `${prefix}${cat}`, label: `Move to ${cat}` })),
                                        { value: 'new', label: '+ Create New Category', isAction: true }
                                     ]}
                                     onChange={(val) => {
                                         if (val === 'default') setCustomCategory(show.id, defaultCat);
                                         else if (val === 'new') {
                                             const name = window.prompt("Enter new category name:");
                                             if (name && name.trim()) setCustomCategory(show.id, `${prefix}${name.trim()}`);
                                         } else {
                                             setCustomCategory(show.id, val);
                                         }
                                         setActiveSettingsMenu(null);
                                     }}
                                 />
                             );
                         })()}
                         <button className="btn-small btn-remove" style={{ margin: 0 }} onClick={() => { removeShow(show.id); setActiveSettingsMenu(null); }}>🗑️ Remove from Log</button>
                     </div>
                 )}
               </div>
             </>
          ) : (
             <div className="rating-pill" style={{ justifyContent: 'space-between', width: '100%', padding: '0.4rem 1rem' }}>
                 <span className="rating-pill-label">Rating</span>
                 <span className="rating-pill-input" style={{ width: 'auto' }}>{show.rating || '-'}</span>
                 <span className="rating-pill-max">/10</span>
             </div>
          )}
        </div>
      </div>
    );
  };

  // --- RENDER MAIN APP ---
  if (!currentUser) {
    return (
      <div className="container">
        <section className="view glass-panel" style={{ maxWidth: '500px', margin: '4rem auto' }}>
          <h1 className="logo" style={{ textAlign: 'center' }}>Rank<span>Box</span></h1>
          <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-muted)' }}>Sign in or create an account</p>
          <form className="auth-form" onSubmit={handleAuth}>
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <div className="auth-buttons">
              <button type="button" className={authMode === 'login' ? 'primary' : 'btn-secondary'} onClick={() => setAuthMode('login')}>Login</button>
              <button type="button" className={authMode === 'register' ? 'primary' : 'btn-secondary'} onClick={() => setAuthMode('register')}>Register</button>
            </div>
            {authMode === 'login' ? (
                <button type="submit" className="primary" style={{ marginTop: '1rem' }} disabled={isAuthLoading}>
                  {isAuthLoading ? 'Authenticating...' : 'Sign In'}
                </button>
            ) : (
                <button type="submit" className="primary" style={{ marginTop: '1rem' }} disabled={isAuthLoading}>
                  {isAuthLoading ? 'Creating Account...' : 'Create Account'}
                </button>
            )}
            {authError && <div className="error-msg">{authError}</div>}
          </form>
        </section>
      </div>
    );
  }

  return (
    <>
      <nav>
        <div className="nav-logo">Rank<span>Box</span></div>
        <div className="nav-links">
          <button className={currentView === 'discover' ? 'active-nav' : ''} onClick={() => setCurrentView('discover')}>Discover</button>
          <button className={currentView === 'log' ? 'active-nav' : ''} onClick={() => { setCurrentView('log'); setActiveCollection(null); fetchMyShows(currentUser.id); }}>My Log</button>
          <button className={currentView === 'social' ? 'active-nav' : ''} onClick={() => { setCurrentView('social'); setActiveCollection(null); }}>Find Users</button>
          <button onClick={handleLogout}>Logout ({currentUser.username})</button>
        </div>
      </nav>

      <div className="container">
        {/* DISCOVER VIEW */}
        {currentView === 'discover' && (
          <section className="view">
            <div className="search-section glass-panel">
              <h2 style={{ marginBottom: '0.5rem' }}>Discover Shows</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Search the entire Anime & TV universe instantly.</p>
              <div className="search-controls">
                <input type="text" placeholder="Search for any Anime, TV Show, or Movie..." 
                       value={discoverQuery} onChange={e => setDiscoverQuery(e.target.value)} 
                       onKeyDown={e => e.key === 'Enter' && handleUnifiedSearch()} />
                <button className="primary" onClick={handleUnifiedSearch}>Search</button>
              </div>
              
              {isDiscoverLoading ? <div className="loader">Searching...</div> : (
                <div className="results-grid">
                  {discoverResults.length === 0 ? <div className="loader">No results found.</div> : (
                    discoverResults.map(show => {
                      const isAdded = myShows.some(s => s.api_id === show.api_id);
                      return (
                        <div key={show.api_id} className="card">
                          <img className="card-img" src={show.image || '/placeholder.png'} alt={show.title} onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder.png'; }} />
                          <div className="card-content">
                            <h3 className="card-title">{show.title}</h3>
                            <span className="card-type">{show.type}</span>
                            <div className="card-desc" dangerouslySetInnerHTML={{ __html: show.description }}></div>
                            <div className="card-actions">
                              <button className="btn-small" onClick={() => addShow(show)} disabled={isAdded}>
                                {isAdded ? 'Added to Log' : 'Add to Log'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              
              <div style={{ textAlign: 'center', marginTop: '3rem', padding: '1rem' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Can't find what you're looking for?</p>
                  <button className="btn-small" style={{ maxWidth: '300px', margin: '0 auto', borderColor: 'var(--accent-secondary)', color: 'white', background: 'var(--accent-secondary)' }} onClick={() => setShowCustomModal(true)}>+ Add Custom Item</button>
              </div>
            </div>
          </section>
        )}

        {/* LOG VIEW */}
        {currentView === 'log' && (() => {
          const filteredShows = myShows.filter(show => {
              if (primaryTab === 'all') return true;
              if (primaryTab === 'watch') {
                  if (secondaryTab === 'all') return show.category === 'anime' || show.category === 'tv' || show.category.startsWith('custom_watch:');
                  if (secondaryTab === 'anime') return show.category === 'anime';
                  if (secondaryTab === 'tv') return show.category === 'tv';
                  return show.category === `custom_watch:${secondaryTab}`;
              }
              if (primaryTab === 'read') {
                  if (secondaryTab === 'all') return show.category === 'manga' || show.category === 'book' || show.category.startsWith('custom_read:');
                  if (secondaryTab === 'manga') return show.category === 'manga';
                  if (secondaryTab === 'book') return show.category === 'book';
                  return show.category === `custom_read:${secondaryTab}`;
              }
              return true;
          });

          return (
          <section className="view">
            <div className="log-section glass-panel">
              <h2>My Watchlog</h2>
              
              <div className="log-tabs">
                  <button className={primaryTab === 'all' ? 'active' : ''} onClick={() => { setPrimaryTab('all'); setSecondaryTab('all'); }}>All</button>
                  <button className={primaryTab === 'watch' ? 'active' : ''} onClick={() => { setPrimaryTab('watch'); setSecondaryTab('all'); }}>Watch (Anime/TV)</button>
                  <button className={primaryTab === 'read' ? 'active' : ''} onClick={() => { setPrimaryTab('read'); setSecondaryTab('all'); }}>Read (Manga/Books)</button>
              </div>

              {primaryTab === 'watch' && (
                  <div className="sub-tabs">
                      <button className={secondaryTab === 'all' ? 'active' : ''} onClick={() => setSecondaryTab('all')}>All Watch</button>
                      <button className={secondaryTab === 'anime' ? 'active' : ''} onClick={() => setSecondaryTab('anime')}>Anime</button>
                      <button className={secondaryTab === 'tv' ? 'active' : ''} onClick={() => setSecondaryTab('tv')}>TV / Movies</button>
                      {watchCategories.map(cat => (
                          <button key={cat} className={secondaryTab === cat ? 'active' : ''} onClick={() => setSecondaryTab(cat)}>{cat}</button>
                      ))}
                  </div>
              )}
              {primaryTab === 'read' && (
                  <div className="sub-tabs">
                      <button className={secondaryTab === 'all' ? 'active' : ''} onClick={() => setSecondaryTab('all')}>All Read</button>
                      <button className={secondaryTab === 'manga' ? 'active' : ''} onClick={() => setSecondaryTab('manga')}>Manga</button>
                      <button className={secondaryTab === 'book' ? 'active' : ''} onClick={() => setSecondaryTab('book')}>Books / Novels</button>
                      {readCategories.map(cat => (
                          <button key={cat} className={secondaryTab === cat ? 'active' : ''} onClick={() => setSecondaryTab(cat)}>{cat}</button>
                      ))}
                  </div>
              )}

              <div className="log-grid">
                {renderCards(filteredShows, true)}
              </div>
            </div>
          </section>
          );
        })()}

        {/* SOCIAL VIEW */}
        {currentView === 'social' && (
          <section className="view">
            <div className="search-section glass-panel">
              <h2>Find Users</h2>
              <div className="search-controls" style={{ maxWidth: '600px' }}>
                <input type="text" placeholder="Search by username..." 
                       value={socialSearch} onChange={e => setSocialSearch(e.target.value)} 
                       onKeyDown={e => e.key === 'Enter' && handleSocialSearch()} />
                <button className="primary" onClick={handleSocialSearch}>Find</button>
              </div>
              {socialError && <div className="error-msg">Error: {socialError}</div>}
              <div className="user-list" style={{ maxWidth: '600px' }}>
                {socialUsers.map(u => (
                    <div key={u.id} className="user-item" onClick={() => viewUserLog(u)}>@{u.username}</div>
                ))}
              </div>
            </div>

            {activeSocialUser && (
                <div className="log-section glass-panel view">
                  <h2>@{activeSocialUser.username}'s Watchlog</h2>
                  <div className="log-grid">
                      {renderCards(socialShows, false)}
                  </div>
                </div>
            )}
          </section>
        )}
      </div>

      {showCustomModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '500px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center', color: 'white' }}>Add Custom Item</h2>
            <form onSubmit={handleCreateCustomItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="text" placeholder="Title" value={customItem.title} onChange={e => setCustomItem({...customItem, title: e.target.value})} className="auth-input" required />
              <select value={customItem.type} onChange={e => setCustomItem({...customItem, type: e.target.value})} className="auth-input" style={{ appearance: 'auto', background: 'rgba(0,0,0,0.5)' }}>
                  <option value="Anime">Anime</option>
                  <option value="TV">TV Series</option>
                  <option value="Movie">Movie</option>
                  <option value="Manga">Manga</option>
                  <option value="Book">Book/Novel</option>
              </select>
              <input type="text" placeholder="Cover Image URL (Optional)" value={customItem.cover_url} onChange={e => setCustomItem({...customItem, cover_url: e.target.value})} className="auth-input" />
              <textarea placeholder="Description (Optional)" value={customItem.description} onChange={e => setCustomItem({...customItem, description: e.target.value})} className="auth-input" style={{ minHeight: '80px', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="button" onClick={() => setShowCustomModal(false)} className="btn-small" style={{ background: 'transparent', border: '1px solid var(--text-muted)', color: 'white' }}>Cancel</button>
                  <button type="submit" className="btn-small" style={{ background: 'var(--accent-primary)', color: 'white' }}>Add to Log</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
