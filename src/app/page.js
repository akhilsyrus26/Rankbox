'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    // Check active session on load
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch profile
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          setCurrentUser({ id: session.user.id, email: session.user.email, username: profile.username });
          fetchMyShows(session.user.id);
          loadDefaultTrending();
        }
      }
    };
    checkSession();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setCurrentUser({ id: session.user.id, email: session.user.email, username: profile?.username });
        fetchMyShows(session.user.id);
        setCurrentView('discover');
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setMyShows([]);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!username || !password) return setAuthError('Please fill in all fields.');

    // Since Supabase Auth uses email, we'll auto-generate a pseudo-email if they only provide a username for this prototype.
    // In a real app, you'd ask for an actual email.
    const pseudoEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@rankboxapp.com`;

    if (authMode === 'register') {
      const { data, error } = await supabase.auth.signUp({ email: pseudoEmail, password });
      if (error) return setAuthError(error.message);
      
      // Create profile
      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert([{ id: data.user.id, username }]);
        if (profileError) {
          setAuthError('Username might already be taken.');
          await supabase.auth.signOut();
        } else {
            loadDefaultTrending();
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: pseudoEmail, password });
      if (error) return setAuthError(error.message);
      loadDefaultTrending();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- API FETCHING ---
  const fetchMyShows = async (userId) => {
    const { data, error } = await supabase.from('shows').select('*').eq('user_id', userId);
    if (!error && data) setMyShows(data);
  };

  const loadDefaultTrending = async () => {
    setIsDiscoverLoading(true);
    try {
      const [jikanRes, tvmazeRes] = await Promise.all([
        fetch('https://api.jikan.moe/v4/top/anime?limit=8'),
        fetch('https://api.tvmaze.com/shows')
      ]);
      const jikanData = await jikanRes.json();
      const tvmazeData = await tvmazeRes.json();

      const animeResults = (jikanData.data || []).map(anime => ({
        api_id: `anime_${anime.mal_id}`, title: anime.title,
        image: anime.images.jpg.image_url, type: 'Anime', category: 'anime',
        description: anime.synopsis || "No description available.",
        popularity: anime.members || 0
      }));

      const tvResults = (tvmazeData || []).slice(0, 8).map(show => ({
        api_id: `tv_${show.id}`, title: show.name,
        image: show.image ? show.image.medium : 'https://via.placeholder.com/210x295/000000/FFFFFF',
        type: 'TV/Movie', category: 'tv',
        description: show.summary ? show.summary.replace(/<[^>]+>/g, '') : "No description available.",
        popularity: show.weight * 10000
      }));

      const combined = [...animeResults, ...tvResults].sort((a, b) => b.popularity - a.popularity);
      setDiscoverResults(combined);
    } catch(err) {}
    setIsDiscoverLoading(false);
  };

  const handleUnifiedSearch = async () => {
    if (!discoverQuery.trim()) return loadDefaultTrending();
    setIsDiscoverLoading(true);
    try {
      const [jikanRes, tvmazeRes] = await Promise.all([
        fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(discoverQuery)}&limit=10`),
        fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(discoverQuery)}`)
      ]);
      const jikanData = await jikanRes.json();
      const tvmazeData = await tvmazeRes.json();

      const animeResults = (jikanData.data || []).map(anime => ({
        api_id: `anime_${anime.mal_id}`, title: anime.title, image: anime.images.jpg.image_url,
        type: 'Anime', category: 'anime', description: anime.synopsis || "No description available.",
        popularity: anime.members || 0
      }));

      const tvResults = (tvmazeData || []).slice(0, 10).map(item => ({
        api_id: `tv_${item.show.id}`, title: item.show.name,
        image: item.show.image ? item.show.image.medium : 'https://via.placeholder.com/210x295/000000/FFFFFF',
        type: 'TV/Movie', category: 'tv', description: item.show.summary ? item.show.summary.replace(/<[^>]+>/g, '') : "No description available.",
        popularity: item.score ? item.score * 100000 : 0
      }));

      let combined = [...animeResults, ...tvResults];
      combined.forEach(show => { if (show.title.toLowerCase() === discoverQuery.toLowerCase()) show.popularity += 10000000; });
      combined.sort((a, b) => b.popularity - a.popularity);
      
      setDiscoverResults(combined.slice(0, 16));
    } catch (err) {}
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

  const addToCollection = async (id, currentName) => {
    const name = window.prompt("Enter a collection name (e.g., 'Bleach') to group this show, or leave it completely blank to remove it from any collection:", currentName || "");
    if (name === null) return;
    
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

  // --- SOCIAL ACTIONS ---
  const handleSocialSearch = async () => {
    if (!socialSearch.trim()) return;
    const { data } = await supabase.from('profiles').select('*').ilike('username', `%${socialSearch}%`).limit(20);
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
    return (
      <div className="card">
        <img className="card-img" src={show.image} alt={show.title} />
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
               <div className="card-actions">
                 <button className="btn-small btn-group" onClick={() => addToCollection(show.id, show.collection_name)}>📂 Move to Collection</button>
                 <button className="btn-small btn-remove" onClick={() => removeShow(show.id)}>🗑️ Remove from Log</button>
               </div>
             </>
          ) : (
             <div className="rating-pill" style={{ justifyContent: 'center', width: '100%' }}>
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
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <div className="auth-buttons">
              <button type="button" className={authMode === 'login' ? 'primary' : 'btn-secondary'} onClick={() => setAuthMode('login')}>Login</button>
              <button type="button" className={authMode === 'register' ? 'primary' : 'btn-secondary'} onClick={() => setAuthMode('register')}>Register</button>
            </div>
            {authMode === 'login' ? (
                <button type="submit" className="primary" style={{ marginTop: '1rem' }}>Sign In</button>
            ) : (
                <button type="submit" className="primary" style={{ marginTop: '1rem' }}>Create Account</button>
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
                          <img className="card-img" src={show.image} alt={show.title} />
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
            </div>
          </section>
        )}

        {/* LOG VIEW */}
        {currentView === 'log' && (
          <section className="view">
            <div className="log-section glass-panel">
              <h2>My Watchlog</h2>
              <div className="log-grid">
                {renderCards(myShows, true)}
              </div>
            </div>
          </section>
        )}

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
    </>
  );
}
