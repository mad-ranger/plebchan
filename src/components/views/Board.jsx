import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Tooltip } from 'react-tooltip';
import { Virtuoso } from 'react-virtuoso';
import { useAccount, useAccountComments, useFeed, usePublishComment } from '@plebbit/plebbit-react-hooks';
import { flattenCommentsPages } from '@plebbit/plebbit-react-hooks/dist/lib/utils'
import { debounce } from 'lodash';
import useGeneralStore from '../../hooks/stores/useGeneralStore';
import { Container, NavBar, Header, Break, PostFormLink, PostFormTable, PostForm, TopBar, BoardForm } from '../styled/Board.styled';
import { Footer } from '../styled/Thread.styled';
import ImageBanner from '../ImageBanner';
import Post from '../Post';
import PostLoader from '../PostLoader';
import ReplyModal from '../ReplyModal';
import SettingsModal from '../SettingsModal';
import findShortParentCid from '../../utils/findShortParentCid';
import getCommentMediaInfo from '../../utils/getCommentMediaInfo';
import getDate from '../../utils/getDate';
import handleAddressClick from '../../utils/handleAddressClick';
import handleImageClick from '../../utils/handleImageClick';
import handleQuoteClick from '../../utils/handleQuoteClick';
import handleStyleChange from '../../utils/handleStyleChange';
import useClickForm from '../../hooks/useClickForm';
import useError from '../../hooks/useError';
import packageJson from '../../../package.json'
const {version} = packageJson


const Board = () => {
  const {
    setCaptchaResponse,
    setChallengesArray,
    defaultSubplebbits,
    setIsCaptchaOpen,
    isSettingsOpen, setIsSettingsOpen,
    setPendingComment,
    setPendingCommentIndex,
    setResolveCaptchaPromise,
    selectedAddress, setSelectedAddress,
    setSelectedParentCid,
    setSelectedShortCid,
    selectedStyle,
    setSelectedThread,
    selectedTitle, setSelectedTitle,
    showPostForm,
    showPostFormLink,
  } = useGeneralStore(state => state);

  const nameRef = useRef();
  const subjectRef = useRef();
  const commentRef = useRef();
  const linkRef = useRef();

  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const navigate = useNavigate();
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  const [visible, setVisible] = useState(true);
  const { feed, hasMore, loadMore } = useFeed({subplebbitAddresses: [`${selectedAddress}`], sortType: 'new'});
  const [selectedFeed, setSelectedFeed] = useState(feed);
  const { subplebbitAddress } = useParams();

  const [errorMessage, setErrorMessage] = useState(null);
  useError(errorMessage, [errorMessage]);

  const account = useAccount();

  const [triggerPublishComment, setTriggerPublishComment] = useState(false);


  const flattenedRepliesByThread = useMemo(() => {
    return selectedFeed.reduce((acc, thread) => {
      const replies = flattenCommentsPages(thread.replies);
      acc[thread.cid] = replies;
      return acc;
    }, {});
  }, [selectedFeed]);
  

  const allParentCids = useMemo(() => {
    const allRepliesCids = Object.values(flattenedRepliesByThread).flatMap(replies => replies.map(reply => reply.cid));
    const allThreadCids = selectedFeed.map(thread => thread.cid);
    return [...allThreadCids, ...allRepliesCids];
  }, [flattenedRepliesByThread, selectedFeed]);  
  

  const filter = useMemo(() => ({
    parentCids: allParentCids
  }), [allParentCids]);
  

  const { accountComments } = useAccountComments({ filter });
  

  const filteredRepliesByThread = useMemo(() => {
    const maxRepliesPerThread = 5;

    const accountRepliesNotYetInCommentReplies = selectedFeed.reduce((acc, thread) => {
      const replyCids = new Set(flattenedRepliesByThread[thread.cid].map(reply => reply.cid));
      acc[thread.cid] = accountComments.filter(accountReply => !replyCids.has(accountReply.cid) && accountReply.parentCid === thread.cid);
      return acc;
    }, {});

    return selectedFeed.reduce((acc, thread) => {
      const combinedReplies = [...flattenedRepliesByThread[thread.cid], ...accountRepliesNotYetInCommentReplies[thread.cid]].sort((a, b) => a.timestamp - b.timestamp);
      acc[thread.cid] = {
        displayedReplies: combinedReplies.slice(0, maxRepliesPerThread),
        omittedCount: Math.max(combinedReplies.length - maxRepliesPerThread, 0),
      };
      return acc;
    }, {});
  }, [flattenedRepliesByThread, accountComments, selectedFeed]);


  const pendingReplyCounts = useMemo(() => {
    return selectedFeed.reduce((acc, thread) => {
      const replyCids = new Set(flattenedRepliesByThread[thread.cid].map(reply => reply.cid));
      acc[thread.cid] = accountComments.filter(accountReply => !replyCids.has(accountReply.cid) && accountReply.parentCid === thread.cid).length;
      return acc;
    }, {});
  }, [flattenedRepliesByThread, accountComments, selectedFeed]);
  

  // temporary title from JSON, gets subplebbitAddress from URL
  useEffect(() => {
    setSelectedAddress(subplebbitAddress);
    const selectedSubplebbit = defaultSubplebbits.find((subplebbit) => subplebbit.address === subplebbitAddress);
    if (selectedSubplebbit) {
      setSelectedTitle(selectedSubplebbit.title);
    }
  }, [subplebbitAddress, setSelectedAddress, setSelectedTitle, defaultSubplebbits]);
  
  // sets useFeed to address from URL
  useEffect(() => {
    setSelectedFeed(feed);
  }, [feed]);

  // mobile navbar scroll effect
  useEffect(() => {
    const debouncedHandleScroll = debounce(() => {
      const currentScrollPos = window.pageYOffset;
      setVisible(prevScrollPos > currentScrollPos || currentScrollPos < 10);
      setPrevScrollPos(currentScrollPos);
    }, 50);
  
    window.addEventListener('scroll', debouncedHandleScroll);
  
    return () => window.removeEventListener('scroll', debouncedHandleScroll);
  }, [prevScrollPos, visible]);
  

  const tryLoadMore = async () => {
    try {
      await loadMore();
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };


  const onChallengeVerification = (challengeVerification) => {
    if (challengeVerification.challengeSuccess === true) {
      navigate(`/p/${selectedAddress}/c/${challengeVerification.publication?.cid}`);
      console.log('challenge success');
    }
    else if (challengeVerification.challengeSuccess === false) {
      setErrorMessage('Challenge Failed', {reason: challengeVerification.reason, errors: challengeVerification.errors});
    }
  };


  const onChallenge = async (challenges, comment) => {
    setPendingComment(comment);
    let challengeAnswers = [];
    
    try {
      challengeAnswers = await getChallengeAnswersFromUser(challenges)
    }
    catch (error) {
      setErrorMessage(error);
    }
    if (challengeAnswers) {
      await comment.publishChallengeAnswers(challengeAnswers)
    }
  };

  
  useEffect(() => {
    setPublishCommentOptions((prevPublishCommentOptions) => ({
      ...prevPublishCommentOptions,
      subplebbitAddress: selectedAddress,
    }));
  }, [selectedAddress]);
  

  const [publishCommentOptions, setPublishCommentOptions] = useState({
    subplebbitAddress: selectedAddress,
    onChallenge,
    onChallengeVerification,
    onError: (error) => {
      setErrorMessage(error);
    },
  });
  

  const { publishComment, index } = usePublishComment(publishCommentOptions);

  useEffect(() => {
    if (index !== undefined) {
      setPendingCommentIndex(index);
      navigate(`/profile/c/${index}`);
    }
  }, [index, navigate, setPendingCommentIndex]);

  
  const resetFields = useCallback(() => {
    if (nameRef.current) {
      nameRef.current.value = '';
    }
    if (subjectRef.current) {
      subjectRef.current.value = '';
    }
    if (commentRef.current) {
      commentRef.current.value = '';
    }
    if (linkRef.current) {
      linkRef.current.value = '';
    }
  }, []);


  const handleSubmit = async (event) => {
    event.preventDefault();

    setPublishCommentOptions((prevPublishCommentOptions) => ({
      ...prevPublishCommentOptions,
      author: {
        displayName: nameRef.current.value || undefined,
      },
      title: subjectRef.current.value || undefined,
      content: commentRef.current.value || undefined,
      link: linkRef.current.value || undefined,
    }));

    setTriggerPublishComment(true);
  };
  
  
  useEffect(() => {
    if (publishCommentOptions.content && triggerPublishComment) {
      (async () => {
        await publishComment();
        resetFields();
      })();
    }
  }, [publishCommentOptions, triggerPublishComment, publishComment, resetFields]);
  
  
  const getChallengeAnswersFromUser = async (challenges) => {
    setChallengesArray(challenges);
    
    return new Promise((resolve, reject) => {
      const imageString = challenges?.challenges[0].challenge;
      const imageSource = `data:image/png;base64,${imageString}`;
      const challengeImg = new Image();
      challengeImg.src = imageSource;
  
      challengeImg.onload = () => {
        setIsCaptchaOpen(true);
  
        const handleKeyDown = async (event) => {
          if (event.key === 'Enter') {
            const currentCaptchaResponse = useGeneralStore.getState().captchaResponse;
            resolve(currentCaptchaResponse);
            setIsCaptchaOpen(false);
            document.removeEventListener('keydown', handleKeyDown);
            event.preventDefault();
          }
        };

        setCaptchaResponse('');
        document.addEventListener('keydown', handleKeyDown);

        setResolveCaptchaPromise(resolve);
      };
  
      challengeImg.onerror = () => {
        reject(setErrorMessage('Could not load challenges'));
      };
    });
  };

  // desktop navbar board select functionality
  const handleClickTitle = (title, address) => {
    setSelectedTitle(title);
    setSelectedAddress(address);
    setSelectedFeed(feed.filter(feed => feed.title === title));

    if (subplebbitAddress === address) {
      window.location.reload();
    }
  };

  // mobile navbar board select functionality
  const handleSelectChange = (event) => {
    const selected = event.target.value;
    const selectedTitle = defaultSubplebbits.find((subplebbit) => subplebbit.address === selected).title;
    setSelectedTitle(selectedTitle);
    setSelectedAddress(selected);
    navigate(`/p/${selected}`);
  };


  return (
    <>
      <Helmet>
        <title>{((selectedTitle ? selectedTitle : selectedAddress) + " - plebchan")}</title>
      </Helmet>
      <Container>
        <ReplyModal 
        selectedStyle={selectedStyle}
        isOpen={isReplyOpen}
        closeModal={() => setIsReplyOpen(false)} />
        <SettingsModal
        selectedStyle={selectedStyle}
        isOpen={isSettingsOpen}
        closeModal={() => setIsSettingsOpen(false)} />
        <NavBar selectedStyle={selectedStyle}>
          <>
            {defaultSubplebbits.map(subplebbit => (
              <span className="boardList" key={`span-${subplebbit.address}`}>
                [
                <Link to={`/p/${subplebbit.address}`} key={`a-${subplebbit.address}`} onClick={() => handleClickTitle(subplebbit.title, subplebbit.address)}
                >{subplebbit.title ? subplebbit.title : subplebbit.address}</Link>
                ]&nbsp;
              </span>
            ))}
            <span className="nav">
              [
              <Link to={`/p/${selectedAddress}/settings`} onClick={() => setIsSettingsOpen(true)}>Settings</Link>
              ]
              [
              <Link to="/" onClick={() => handleStyleChange({target: {value: "Yotsuba"}}
              )}>Home</Link>
              ]
            </span>
            <div id="board-nav-mobile" style={{ top: visible ? 0 : '-23px' }}>
              <div className="board-select">
                <strong>Board</strong>
                &nbsp;
                <select id="board-select-mobile" value={selectedAddress} onChange={handleSelectChange}>
                  {defaultSubplebbits.map(subplebbit => (
                      <option key={`option-${subplebbit.address}`} value={subplebbit.address}
                      >{subplebbit.title ? subplebbit.title : subplebbit.address}</option>
                    ))}
                </select>
              </div>
              <div className="page-jump">
                <Link to={`/p/${selectedAddress}/settings`} onClick={() => setIsSettingsOpen(true)}>Settings</Link>
                &nbsp;
                <Link to="/" onClick={() => handleStyleChange({target: {value: "Yotsuba"}}
                  )}>Home</Link>
              </div>
            </div>
            <div id="separator-mobile">&nbsp;</div>
            <div id="separator-mobile">&nbsp;</div>
          </>
        </NavBar>
        <Header selectedStyle={selectedStyle}>
          <>
            <div className="banner">
              <ImageBanner />
            </div>
              <>
              <div className="board-title">{selectedTitle}</div>
              <div className="board-address">p/{selectedAddress}</div>
              </>
          </>
        </Header>
        <Break selectedStyle={selectedStyle} />
        <PostForm selectedStyle={selectedStyle}>
        <PostFormLink id="post-form-link" showPostFormLink={showPostFormLink} selectedStyle={selectedStyle} >
          <div id="post-form-link-desktop">
              [
                <Link to={`/p/${subplebbitAddress}/post`} onClick={useClickForm()} onMouseOver={(event) => event.target.style.cursor='pointer'}>Start a New Thread</Link>
              ]
            </div>
            <div id="post-form-link-mobile">
              <span className="btn-wrap">
                <Link to={`/p/${subplebbitAddress}/post`} onClick={useClickForm()} onMouseOver={(event) => event.target.style.cursor='pointer'}>Start a New Thread</Link>
              </span>
            </div>
          </PostFormLink>
          <PostFormTable id="post-form" showPostForm={showPostForm} selectedStyle={selectedStyle} className="post-form">
            <tbody>
              <tr data-type="Name">
                <td id="td-name">Name</td>
                <td>
                  <input name="name" type="text" tabIndex={1} placeholder="Anonymous" ref={nameRef} />
                </td>
              </tr>
              <tr data-type="Subject">
                <td>Subject</td>
                <td>
                  <input name="sub" type="text" tabIndex={3} ref={subjectRef}/>
                  <input id="post-button" type="submit" value="Post" tabIndex={6} 
                  onClick={handleSubmit} />
                </td>
              </tr>
              <tr data-type="Comment">
                <td>Comment</td>
                <td>
                  <textarea name="com" cols="48" rows="4" tabIndex={4} wrap="soft" ref={commentRef} />
                </td>
              </tr>
              <tr data-type="File">
                <td>Embed File</td>
                <td>
                  <input name="embed" type="text" tabIndex={7} placeholder="Paste link" ref={linkRef} />
                  <button id="t-help" type="button" onClick={
                    () => alert("- Embedding media is optional, posts can be text-only. \n- A CAPTCHA challenge will appear after posting. \n- The CAPTCHA is case-sensitive.")
                  } data-tip="Help">?</button>
                </td>
              </tr>
            </tbody>
          </PostFormTable>
        </PostForm>
        <TopBar selectedStyle={selectedStyle}>
          <hr />
          <span className="style-changer">
            Style:
             
            <select id="style-selector" onChange={handleStyleChange} value={selectedStyle}>
              <option value="Yotsuba">Yotsuba</option>
              <option value="Yotsuba-B">Yotsuba B</option>
              <option value="Futaba">Futaba</option>
              <option value="Burichan">Burichan</option>
              <option value="Tomorrow">Tomorrow</option>
              <option value="Photon">Photon</option>
            </select>
          </span>
          <div id="catalog-button-desktop">
            [
            <Link to={`/p/${selectedAddress}/catalog`}>Catalog</Link>
            ]
          </div>
          <div id="stats" style={{float: "right", marginTop: "5px"}}>
            {feed.length > 0 ? (null) : (<span>Fetching IPFS...</span>)}
          </div>
          <div id="catalog-button-mobile">
            <span className="btn-wrap">
              <Link to={`/p/${selectedAddress}/catalog`}>Catalog</Link>
            </span>
          </div>
        </TopBar>
        <Tooltip id="tooltip" className="tooltip" />
        <BoardForm selectedStyle={selectedStyle}>
          <div className="board">
            {feed.length < 1 ? (
              <PostLoader />
            ) : (
              <Virtuoso
                increaseViewportBy={2000}
                data={selectedFeed}
                itemContent={(index, thread) => {
                  const { displayedReplies, omittedCount } = filteredRepliesByThread[thread.cid] || {};
                  const commentMediaInfo = getCommentMediaInfo(thread);
                  const fallbackImgUrl = "assets/filedeleted-res.gif";
                  return (
                <Fragment key={`fr-${index}`}>
                  <div key={`t-${index}`} className="thread">
                    <div key={`c-${index}`} className="op-container">
                      <div key={`po-${index}`} className="post op op-desktop">
                        <hr key={`hr-${index}`} />
                        <div key={`pi-${index}`} className="post-info">
                        {commentMediaInfo?.url ? (
                          <div key={`f-${index}`} className="file" style={{marginBottom: "5px"}}>
                            <div key={`ft-${index}`} className="file-text">
                              Link:&nbsp;
                              <a key={`fa-${index}`} href={commentMediaInfo.url} target="_blank"
                              rel="noopener noreferrer">{
                              commentMediaInfo?.url.length > 30 ?
                              commentMediaInfo?.url.slice(0, 30) + "(...)" :
                              commentMediaInfo?.url
                              }</a>&nbsp;({commentMediaInfo?.type})
                            </div>
                            {commentMediaInfo?.type === "webpage" ? (
                              <span key={`fta-${index}`} className="file-thumb">
                                {thread.thumbnailUrl ? (
                                  <img key={`fti-${index}`} 
                                  src={thread.thumbnailUrl} alt={commentMediaInfo.type}
                                  onClick={handleImageClick}
                                  style={{cursor: "pointer"}}
                                  onError={(e) => e.target.src = fallbackImgUrl} />
                                ) : null}
                              </span>
                            ) : null}
                            {commentMediaInfo?.type === "image" ? (
                              <span key={`fta-${index}`} className="file-thumb">
                                <img key={`fti-${index}`} 
                                src={commentMediaInfo.url} alt={commentMediaInfo.type}
                                onClick={handleImageClick}
                                style={{cursor: "pointer"}}
                                onError={(e) => e.target.src = fallbackImgUrl} />
                              </span>
                            ) : null}
                            {commentMediaInfo?.type === "video" ? (
                              <span key={`fta-${index}`} className="file-thumb">
                                <video controls width="" key={`fti-${index}`} 
                                src={commentMediaInfo.url} alt={commentMediaInfo.type}
                                onError={(e) => e.target.src = fallbackImgUrl} />
                              </span>
                            ) : null}
                            {commentMediaInfo?.type === "audio" ? (
                              <span key={`fta-${index}`} className="file-thumb">
                                <audio controls key={`fti-${index}`} 
                                src={commentMediaInfo.url} alt={commentMediaInfo.type}
                                onError={(e) => e.target.src = fallbackImgUrl} />
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                          <span key={`nb-${index}`} className="name-block">
                            {thread.title ? (
                              thread.title.length > 75 ?
                              <Fragment key={`fragment2-${index}`}>
                                <span key={`q-${index}`} className="title"
                                data-tooltip-id="tooltip"
                                data-tooltip-content={thread.title}
                                data-tooltip-place="top">
                                  {thread.title.slice(0, 75) + " (...)"}
                                </span>
                              </Fragment>
                            : <span key={`q-${index}`} className="title">
                              {thread.title}
                              </span>) 
                            : null}&nbsp;
                            {thread.author.displayName
                            ? thread.author.displayName.length > 20
                            ? <Fragment key={`fragment3-${index}`}>
                                <span key={`n-${index}`} className="name"
                                data-tooltip-id="tooltip"
                                data-tooltip-content={thread.author.displayName}
                                data-tooltip-place="top">
                                  {thread.author.displayName.slice(0, 20) + " (...)"}
                                </span>
                              </Fragment> 
                              : <span key={`n-${index}`} className="name">
                                {thread.author.displayName}</span>
                            : <span key={`n-${index}`} className="name">
                              Anonymous</span>}
                            &nbsp;
                            (u/
                            <span key={`pa-${index}`} className="poster-address address-desktop"
                            id="reply-button" style={{cursor: "pointer"}}
                              onClick={() => handleAddressClick(thread.author.shortAddress)}
                            >
                              {thread.author.shortAddress}
                            </span>)
                            &nbsp;
                            <span key={`dt-${index}`} className="date-time" data-utc="data">{getDate(thread.timestamp)}</span>
                            &nbsp;
                            <span key={`pn-${index}`} className="post-number post-number-desktop">
                              <span style={{cursor: 'pointer'}} id="reply-button" key={`pl1-${index}`} title="Link to this post">c/</span>
                              <Link to={`/p/${selectedAddress}/c/${thread.cid}`} id="reply-button" key={`pl2-${index}`} 
                              onClick={(e) => {
                                if (e.button === 2) return;
                                e.preventDefault();
                                setIsReplyOpen(true); 
                                setSelectedShortCid(thread.shortCid); 
                                setSelectedParentCid(thread.cid);
                                }} title="Reply to this post">{thread.shortCid}</Link>
                              &nbsp;
                              <span key={`rl1-${index}`}>&nbsp;
                                [
                                <Link key={`rl2-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="reply-link" >Reply</Link>
                                ]
                              </span>
                            </span>&nbsp;
                            <button key={`pmb-${index}`} className="post-menu-button" title="Post menu" style={{ all: 'unset', cursor: 'pointer' }} data-cmd="post-menu">▶</button>
                            <div key={`bi-${index}`} id="backlink-id" className="backlink">
                              {thread.replies?.pages?.topAll.comments
                                .sort((a, b) => a.timestamp - b.timestamp)
                                .map((reply, index) => (
                                  <div key={`div-${index}`} style={{display: 'inline-block'}}>
                                  <Link key={`ql-${index}`}
                                  to={() => {}} className="quote-link" 
                                  onClick={(event) => handleQuoteClick(reply, null, event)}>
                                    c/{reply.shortCid}</Link>
                                    &nbsp;
                                  </div>
                                ))
                              }
                            </div>
                          </span>
                          {thread.content ? (
                            thread.content?.length > 1000 ?
                            <Fragment key={`fragment5-${index}`}>
                              <blockquote key={`bq-${index}`}>
                              <Post content={thread.content?.slice(0, 1000)} key={`post-${index}`} />
                                <span key={`ttl-s-${index}`} className="ttl"> (...) 
                                <br key={`ttl-s-br1-${index}`} /><br key={`ttl-s-br2${thread.cid}`} />
                                Post too long.&nbsp;
                                  <Link key={`ttl-l-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="ttl-link">Click here</Link>
                                  &nbsp;to view. </span>
                              </blockquote>
                            </Fragment>
                          : <blockquote key={`bq-${index}`}>
                              <Post content={thread.content} key={`post-${index}`} />
                            </blockquote>)
                          : null}
                        </div>
                      </div>
                    </div>
                    <span key={`summary-${index}`} className="summary">
                      {omittedCount > 0 ? (
                      <span key={`oc-${index}`} className="ttl">
                        <span key={`oc1-${index}`}>
                          {omittedCount} post{omittedCount > 1 ? "s" : ""} omitted. Click&nbsp;
                          <Link key={`oc2-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="ttl-link">here</Link>
                          &nbsp;to view.
                        </span>
                      </span>) : null}
                    </span>
                    {displayedReplies?.map((reply, index) => {
                      const replyMediaInfo = getCommentMediaInfo(reply);
                      const fallbackImgUrl = "assets/filedeleted-res.gif";
                      const shortParentCid = findShortParentCid(reply.parentCid, selectedFeed);
                      return (
                        <div key={`rc-${index}`} className="reply-container">
                          <div key={`sa-${index}`} className="side-arrows">{'>>'}</div>
                          <div key={`pr-${index}`} className="post-reply post-reply-desktop">
                            <div key={`pi-${index}`} className="post-info">
                              <span key={`nb-${index}`} className="nameblock">
                                {reply.author.displayName
                                  ? reply.author.displayName.length > 12
                                  ? <Fragment key={`fragment6-${index}`}>
                                      <span key={`mob-n-${index}`} className="name"
                                      data-tooltip-id="tooltip"
                                      data-tooltip-content={reply.author.displayName}
                                      data-tooltip-place="top">
                                        {reply.author.displayName.slice(0, 12) + " (...)"}
                                      </span>
                                    </Fragment>
                                    : <span key={`mob-n-${index}`} className="name">
                                      {reply.author.displayName}</span>
                                  : <span key={`mob-n-${index}`} className="name">
                                    Anonymous</span>}
                                &nbsp;
                                <span key={`pa-${index}`} className="poster-address address-desktop"
                                  id="reply-button" style={{cursor: "pointer"}}
                                  onClick={() => handleAddressClick(reply.author.shortAddress)}
                                >
                                  (u/
                                    {reply.author?.shortAddress ?
                                      (
                                        <span key={`mob-ha-${index}`}>
                                          {reply.author?.shortAddress}
                                        </span>
                                      ) : (
                                        <span key={`mob-ha-${index}`}
                                          data-tooltip-id="tooltip"
                                          data-tooltip-content={account?.author?.address}
                                          data-tooltip-place="top"
                                        >
                                          {account?.author?.address.slice(0, 10) + "(...)"}
                                        </span>
                                      )
                                    }
                                  )
                                </span>
                              </span>
                              &nbsp;
                              <span key={`dt-${index}`} className="date-time" data-utc="data">{getDate(reply.timestamp)}</span>
                              &nbsp;
                              <span key={`pn-${index}`} className="post-number post-number-desktop">
                                <span id="reply-button" style={{cursor: 'pointer'}} key={`pl1-${index}`} title="Link to this post">c/</span>
                                {reply.shortCid ? (
                                  <Link to={`/p/${selectedAddress}/c/${thread.cid}`} id="reply-button" key={`pl2-${index}`} 
                                  onClick={(e) => {
                                    if (e.button === 2) return;
                                    e.preventDefault();
                                    setIsReplyOpen(true); 
                                    setSelectedShortCid(reply.shortCid); 
                                    setSelectedParentCid(reply.cid);
                                  }} title="Reply to this post">{reply.shortCid}</Link>
                                ) : (
                                  <span key="pending" style={{color: 'red', fontWeight: '700'}}>Pending</span>
                                )}
                              </span>&nbsp;
                              <button key={`pmb-${index}`} className="post-menu-button" title="Post menu" style={{ all: 'unset', cursor: 'pointer' }} data-cmd="post-menu">▶</button>
                              <div id="backlink-id" className="backlink">
                                {reply.replies?.pages?.topAll.comments
                                  .sort((a, b) => a.timestamp - b.timestamp)
                                  .map((reply, index) => (
                                    <div key={`div-${index}`} style={{display: 'inline-block'}}>
                                    <Link to={() => {}} key={`ql-${index}`}
                                      className="quote-link" 
                                      onClick={(event) => handleQuoteClick(reply, reply.shortCid, event)}>
                                      c/{reply.shortCid}</Link>
                                      &nbsp;
                                    </div>
                                  ))
                                }
                              </div>
                            </div>
                            {replyMediaInfo?.url ? (
                              <div key={`f-${index}`} className="file" 
                              style={{marginBottom: "5px"}}>
                                <div key={`ft-${index}`} className="reply-file-text">
                                  Link:&nbsp;
                                  <a key={`fa-${index}`} href={replyMediaInfo.url} target="_blank"
                                  rel="noopener noreferrer">{
                                  replyMediaInfo?.url.length > 30 ?
                                  replyMediaInfo?.url.slice(0, 30) + "(...)" :
                                  replyMediaInfo?.url
                                  }</a>&nbsp;({replyMediaInfo?.type})
                                </div>
                                {replyMediaInfo?.type === "webpage" ? (
                                  <span key={`fta-${index}`} className="file-thumb-reply">
                                    {reply.thumbnailUrl ? (
                                      <img key={`fti-${index}`}
                                      src={reply.thumbnailUrl} alt={replyMediaInfo.type}
                                      onClick={handleImageClick}
                                      style={{cursor: "pointer"}}
                                      onError={(e) => e.target.src = fallbackImgUrl} />
                                    ) : null}
                                  </span>
                                ) : null}
                                {replyMediaInfo?.type === "image" ? (
                                  <span key={`fta-${index}`} className="file-thumb-reply">
                                    <img key={`fti-${index}`}
                                    src={replyMediaInfo.url} alt={replyMediaInfo.type} 
                                    onClick={handleImageClick}
                                    style={{cursor: "pointer"}}
                                    onError={(e) => e.target.src = fallbackImgUrl} />
                                  </span>
                                ) : null}
                                {replyMediaInfo?.type === "video" ? (
                                  <span key={`fta-${index}`} className="file-thumb-reply">
                                    <video controls
                                    key={`fti-${index}`} 
                                    src={replyMediaInfo.url} alt={replyMediaInfo.type} 
                                    onError={(e) => e.target.src = fallbackImgUrl} />
                                  </span>
                                ) : null}
                                {replyMediaInfo?.type === "audio" ? (
                                  <span key={`fta-${index}`} className="file-thumb-reply">
                                    <audio controls 
                                    key={`fti-${index}`}
                                    src={replyMediaInfo.url} alt={replyMediaInfo.type} 
                                    onError={(e) => e.target.src = fallbackImgUrl} />
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {reply.content ? (
                              reply.content?.length > 500 ?
                              <Fragment key={`fragment8-${index}`}>
                                <blockquote key={`pm-${index}`} comment={reply} className="post-message">
                                  <Link to={() => {}} key={`r-pm-${index}`} className="quotelink" onClick={(event) => handleQuoteClick(reply, shortParentCid, thread.shortCid, event)}>
                                      {`c/${shortParentCid}`}{shortParentCid === thread.shortCid ? " (OP)" : null}
                                  </Link>
                                  <Post content={reply.content?.slice(0, 500)} key={`post-${index}`} />
                                  <span key={`ttl-s-${index}`} className="ttl"> (...)
                                  <br key={`ttl-s-br1-${index}`} /><br key={`ttl-s-br2${reply.cid}`} />
                                  Comment too long.&nbsp;
                                    <Link key={`ttl-l-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="ttl-link">Click here</Link>
                                  &nbsp;to view. </span>
                                </blockquote>
                              </Fragment>
                            : <blockquote key={`pm-${index}`} className="post-message">
                                <Link to={() => {}} key={`r-pm-${index}`} className="quotelink" onClick={(event) => handleQuoteClick(reply, shortParentCid, thread.shortCid, event)}>
                                    {`c/${shortParentCid}`}{shortParentCid === thread.shortCid ? " (OP)" : null}
                                </Link>
                                <Post content={reply.content} key={`post-${index}`} comment={reply} />
                              </blockquote>)
                            : null}
                          </div>
                        </div>
                        )
                    })}
                  </div>
                  <div key={`mob-t-${index}`} className="thread-mobile">
                    <hr key={`mob-hr-${index}`} />
                    <div key={`mob-c-${index}`} className="op-container">
                      <div key={`mob-po-${index}`} className="post op op-mobile">
                        <div key={`mob-pi-${index}`} className="post-info-mobile">
                          <button key={`mob-pb-${index}`} className="post-menu-button-mobile" style={{ all: 'unset', cursor: 'pointer' }}>...</button>
                          <span key={`mob-nbm-${index}`} className="name-block-mobile">
                            {thread.author.displayName
                            ? thread.author.displayName.length > 15
                            ? <Fragment key={`fragment9-${index}`}>
                                <span key={`mob-n-${index}`} className="name-mobile"
                                data-tooltip-id="tooltip"
                                data-tooltip-content={thread.author.displayName}
                                data-tooltip-place="top">
                                  {thread.author.displayName.slice(0, 15) + " (...)"}
                                </span>
                              </Fragment> 
                              : <span key={`mob-n-${index}`} className="name-mobile">
                                {thread.author.displayName}</span>
                            : <span key={`mob-n-${index}`} className="name-mobile">
                              Anonymous</span>}
                            &nbsp;
                            <span key={`mob-pa-${index}`} className="poster-address-mobile address-mobile"
                              id="reply-button" style={{cursor: "pointer"}}
                              onClick={() => handleAddressClick(thread.author.shortAddress)}
                            >
                              (u/
                              <span key={`mob-ha-${index}`} className="highlight-address-mobile">
                                {thread.author.shortAddress}
                              </span>
                              )&nbsp;
                            </span>
                            <br key={`mob-br1-${index}`} />
                            {thread.title ? (
                              thread.title.length > 30 ?
                              <Fragment key={`fragment11-${index}`}>
                                <span key={`mob-t-${index}`} className="subject-mobile"
                                data-tooltip-id="tooltip"
                                data-tooltip-content={thread.title}
                                data-tooltip-place="top">
                                  {thread.title.slice(0, 30) + " (...)"}
                                </span>
                              </Fragment>
                            : <span key={`mob-t-${index}`} className="subject-mobile">
                              {thread.title}
                              </span>) 
                            : null}
                          </span>
                          <span key={`mob-dt-${index}`} className="date-time-mobile post-number-mobile">
                            {getDate(thread.timestamp)}
                            &nbsp;
                            <span id="reply-button" style={{cursor: 'pointer'}} key={`mob-no-${index}`} title="Link to this post">c/</span>
                            <Link to={`/p/${selectedAddress}/c/${thread.cid}`} id="reply-button" key={`mob-no2-${index}`} 
                              onClick={(e) => {
                                if (e.button === 2) return;
                                e.preventDefault();
                                setIsReplyOpen(true); 
                                setSelectedShortCid(thread.shortCid); 
                                setSelectedParentCid(thread.cid);
                              }} title="Reply to this post">{thread.shortCid}
                            </Link>
                          </span>
                        </div>
                        {thread.link ? (
                          <div key={`mob-f-${index}`} className="file-mobile">
                            <a key={`link-a-${index}`} href={commentMediaInfo?.url} target="_blank"
                            rel="noopener noreferrer">
                              {commentMediaInfo?.url ? (
                                commentMediaInfo.type === "webpage" ? (
                                    <span key={`mob-ft${thread.cid}`} className="file-thumb-mobile">
                                      {thread.thumbnailUrl ? (
                                        <img key={`mob-img-${index}`} 
                                        src={thread.thumbnailUrl} alt="thumbnail" 
                                        onError={(e) => e.target.src = fallbackImgUrl} />
                                      ) : null}
                                      <div key={`mob-fi-${index}`} className="file-info-mobile">{commentMediaInfo?.type}</div>
                                    </span>
                                ) : commentMediaInfo.type === "image" ? (
                                    <span key={`mob-ft${thread.cid}`} className="file-thumb-mobile">
                                      <img key={`mob-img-${index}`} 
                                      src={commentMediaInfo.url} alt={commentMediaInfo.type} 
                                      onError={(e) => e.target.src = fallbackImgUrl} />
                                      <div key={`mob-fi-${index}`} className="file-info-mobile">{commentMediaInfo?.type}</div>
                                    </span>
                                ) : commentMediaInfo.type === "video" ? (
                                    <span key={`mob-ft${thread.cid}`} className="file-thumb-mobile">
                                      <video key={`fti-${index}`} 
                                      src={commentMediaInfo.url} alt={commentMediaInfo.type}
                                      style={{ pointerEvents: "none" }} 
                                      onError={(e) => e.target.src = fallbackImgUrl} />
                                      <div key={`mob-fi-${index}`} className="file-info-mobile">{commentMediaInfo?.type}</div>
                                    </span>
                                ) : commentMediaInfo.type === "audio" ? (
                                    <span key={`mob-ft${thread.cid}`} className="file-thumb-mobile">
                                      <audio key={`mob-img-${index}`} 
                                      src={commentMediaInfo.url} alt={commentMediaInfo.type} 
                                      onError={(e) => e.target.src = fallbackImgUrl} />
                                      <div key={`mob-fi-${index}`} className="file-info-mobile">{commentMediaInfo?.type}</div>
                                    </span>
                                ) : null
                              ) : null}
                            </a>
                          </div>
                        ) : null}
                        {thread.content ? (
                          thread.content?.length > 500 ?
                          <Fragment key={`fragment12-${index}`}>
                            <blockquote key={`mob-bq-${index}`} className="post-message-mobile">
                              <Post content={thread.content?.slice(0, 500)} key={`post-mobile-${index}`} />
                              <span key={`mob-ttl-s-${index}`} className="ttl"> (...)
                              <br key={`mob-ttl-s-br1-${index}`} /><br key={`mob-ttl-s-br2${thread.cid}`} />
                              Post too long.&nbsp;
                                <Link key={`mob-ttl-l-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="ttl-link">Click here</Link>
                                &nbsp;to view. </span>
                            </blockquote>
                          </Fragment>
                        : <blockquote key={`mob-bq-${index}`} className="post-message-mobile">
                            <Post content={thread.content} key={`post-mobile-${index}`} />
                          </blockquote>)
                        : null}
                      </div>
                      <div key={`mob-pl-${index}`} className="post-link-mobile">
                        <span key={`mob-info-${index}`} className="info-mobile">{
                        (thread.replyCount + pendingReplyCounts[thread.cid]) === 0 ?
                        ("No replies")
                        : (thread.replyCount + pendingReplyCounts[thread.cid]) === 1 ?
                        ("1 reply")
                        : (thread.replyCount + pendingReplyCounts[thread.cid]) > 1 ?
                        ((thread.replyCount + pendingReplyCounts[thread.cid]) + " replies")
                        : null
                        }</span>
                        <Link key={`rl2-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="button-mobile" >View Thread</Link>
                      </div>
                    </div>
                    {displayedReplies?.map((reply, index) => {
                      const replyMediaInfo = getCommentMediaInfo(reply);
                      const shortParentCid = findShortParentCid(reply.parentCid, selectedFeed);
                      return (
                      <div key={`mob-rc-${index}`} className="reply-container">
                        <div key={`mob-pr-${index}`} className="post-reply post-reply-mobile">
                          <div key={`mob-pi-${index}`} className="post-info-mobile">
                            <button key={`pmbm-${index}`} className="post-menu-button-mobile" title="Post menu" style={{ all: 'unset', cursor: 'pointer' }}>...</button>
                            <span key={`mob-nb-${index}`} className="name-block-mobile">
                              {reply.author.displayName
                              ? reply.author.displayName.length > 12
                              ? <Fragment key={`fragment13-${index}`}>
                                  <span key={`mob-n-${index}`} className="name-mobile"
                                  data-tooltip-id="tooltip"
                                  data-tooltip-content={reply.author.displayName}
                                  data-tooltip-place="top">
                                    {reply.author.displayName.slice(0, 12) + " (...)"}
                                  </span>
                                </Fragment>
                                : <span key={`mob-n-${index}`} className="name-mobile">
                                  {reply.author.displayName}</span>
                              : <span key={`mob-n-${index}`} className="name-mobile">
                                Anonymous</span>}
                              &nbsp;
                              <span key={`mob-pa-${index}`} className="poster-address-mobile address-mobile"
                                id="reply-button" style={{cursor: "pointer"}}
                                onClick={() => handleAddressClick(reply.author.shortAddress)}
                              >
                                (u/
                                  {reply.author?.shortAddress ?
                                    (
                                    <span key={`mob-ha-${index}`} className="highlight-address-mobile">
                                      {reply.author?.shortAddress}
                                    </span>
                                    ) : (
                                      <span key={`mob-ha-${index}`} 
                                        data-tooltip-id="tooltip"
                                        data-tooltip-content={account?.author?.address}
                                        data-tooltip-place="top"
                                          >
                                        {account?.author?.address.slice(0, 8) + "(...)"}
                                      </span>
                                    )
                                  }
                                )&nbsp;
                              </span>
                              <br key={`mob-br-${index}`} />
                            </span>
                            <span key={`mob-dt-${index}`} className="date-time-mobile post-number-mobile">
                            {getDate(reply.timestamp)}&nbsp;
                              <span id="reply-button" style={{cursor: 'pointer'}} key={`mob-pl1-${index}`} title="Link to this post">c/</span>
                              {reply.shortCid ? (
                                <Link to={`/p/${selectedAddress}/c/${thread.cid}`} id="reply-button" key={`mob-pl2-${index}`} 
                                  onClick={(e) => {
                                    if (e.button === 2) return;
                                    e.preventDefault();
                                    setIsReplyOpen(true); 
                                    setSelectedShortCid(reply.shortCid); 
                                    setSelectedParentCid(reply.cid);
                                  }} title="Reply to this post">{reply.shortCid}
                                </Link>
                              ) : (
                                <span key="pending" style={{color: 'red', fontWeight: '700'}}>Pending</span> 
                              )}
                            </span>
                          </div>
                          {reply.link ? (
                            <div key={`mob-f-${index}`} className="file-mobile">
                              <a key={`link-a-${index}`} href={replyMediaInfo?.url} target="_blank" rel="noopener noreferrer">
                                {replyMediaInfo?.url ? (
                                  replyMediaInfo.type === "webpage" ? (
                                      <span key={`mob-ft${reply.cid}`} className="file-thumb-mobile">
                                        {reply.thumbnailUrl ? (
                                          <img key={`mob-img-${index}`} src={reply.thumbnailUrl} alt="thumbnail" onError={(e) => e.target.src = fallbackImgUrl} />
                                        ) : null}
                                        <div key={`mob-fi-${index}`} className="file-info-mobile">{replyMediaInfo.type}</div>
                                      </span>
                                  ) : replyMediaInfo.type === "image" ? (
                                      <span key={`mob-ft${reply.cid}`} className="file-thumb-mobile">
                                        <img key={`mob-img-${index}`} src={replyMediaInfo.url} alt={replyMediaInfo.type} onError={(e) => e.target.src = fallbackImgUrl} />
                                        <div key={`mob-fi-${index}`} className="file-info-mobile">{replyMediaInfo.type}</div>
                                      </span>
                                  ) : replyMediaInfo.type === "video" ? (
                                      <span key={`mob-ft${reply.cid}`} className="file-thumb-mobile">
                                          <video key={`fti-${index}`} 
                                          src={replyMediaInfo.url} 
                                          alt={replyMediaInfo.type} 
                                          style={{ pointerEvents: "none" }}
                                          onError={(e) => e.target.src = fallbackImgUrl} />
                                        <div key={`mob-fi-${index}`} className="file-info-mobile">{replyMediaInfo.type}</div>
                                      </span>
                                  ) : replyMediaInfo.type === "audio" ? (
                                      <span key={`mob-ft${reply.cid}`} className="file-thumb-mobile">
                                        <audio key={`mob-img-${index}`} src={replyMediaInfo.url} alt={replyMediaInfo.type} onError={(e) => e.target.src = fallbackImgUrl} />
                                        <div key={`mob-fi-${index}`} className="file-info-mobile">{replyMediaInfo.type}</div>
                                      </span>
                                  ) : null
                                ) : null}
                              </a>
                            </div>
                          ) : null}
                          {reply.content ? (
                            reply.content?.length > 500 ?
                            <Fragment key={`fragment15-${index}`}>
                              <blockquote key={`mob-pm-${index}`} className="post-message">
                                <Link to={() => {}} key={`mob-r-pm-${index}`} className="quotelink" onClick={(event) => handleQuoteClick(reply, shortParentCid, thread.shortCid, event)}>
                                  {`c/${shortParentCid}`}{shortParentCid === thread.shortCid ? " (OP)" : null}
                                </Link>
                                <Post content={reply.content?.slice(0, 500)} key={`post-mobile-${index}`} comment={reply} />
                                <span key={`mob-ttl-s-${index}`} className="ttl"> (...)
                                <br key={`mob-ttl-s-br1-${index}`} /><br key={`mob-ttl-s-br2${reply.cid}`} />
                                Comment too long.&nbsp;
                                  <Link key={`mob-ttl-l-${index}`} to={`/p/${selectedAddress}/c/${thread.cid}`} onClick={() => setSelectedThread(thread.cid)} className="ttl-link">Click here</Link>
                                &nbsp;to view. </span>
                              </blockquote>
                            </Fragment>
                          : <blockquote key={`mob-pm-${index}`} className="post-message">
                              <Link to={() => {}} key={`mob-r-pm-${index}`} className="quotelink" onClick={(event) => handleQuoteClick(reply, shortParentCid, thread.shortCid, event)}>
                                {`c/${shortParentCid}`}{shortParentCid === thread.shortCid ? " (OP)" : null}
                              </Link>
                              <Post content={reply.content} key={`post-mobile-${index}`} comment={reply} />
                            </blockquote>)
                          : null}
                            {reply.replyCount > 0 ? (
                              <div key={`back-mob-${index}`} className='backlink backlink-mobile'>
                              {reply.replies?.pages?.topAll.comments
                              .sort((a, b) => a.timestamp - b.timestamp)
                              .map((reply, index) => (
                                <div key={`div-back${index}`} style={{display: 'inline-block'}}>
                                <Link key={`ql-${index}`} to={() => {}}
                                onClick={(event) => handleQuoteClick(reply, reply.shortCid, event)} className="quote-link">
                                  c/{reply.shortCid}</Link>
                                  &nbsp;
                                </div>
                              ))}
                              </div>
                            ) : null}
                        </div>
                      </div>
                    )})}
                  </div>
                </Fragment>
                  );
                }}
                endReached={tryLoadMore}
                useWindowScroll={true}
                components={{ Footer: hasMore ? () => <PostLoader /> : null }}
              />
            )}
          </div>
        </BoardForm>
        <Footer selectedStyle={selectedStyle}>
          <Break id="break" selectedStyle={selectedStyle} style={{
            marginTop: "-36px",
            width: "100%",
          }} />
          <Break selectedStyle={selectedStyle} style={{
            width: "100%",
          }} />
          <span className="style-changer" style={{
            float: "right",
            marginTop: "2px",
          }}>
            Style:
             
            <select id="style-selector" onChange={handleStyleChange} value={selectedStyle}>
              <option value="Yotsuba">Yotsuba</option>
              <option value="Yotsuba-B">Yotsuba B</option>
              <option value="Futaba">Futaba</option>
              <option value="Burichan">Burichan</option>
              <option value="Tomorrow">Tomorrow</option>
              <option value="Photon">Photon</option>
            </select>
          </span>
          <NavBar selectedStyle={selectedStyle} style={{
            marginTop: "42px",
          }}>
            <>
              {defaultSubplebbits.map(subplebbit => (
                <span className="boardList" key={`span-${subplebbit.address}`}>
                  [
                  <Link key={`a-${subplebbit.address}`} 
                  to={`/p/${subplebbit.address}`} 
                  onClick={() => {
                    setSelectedTitle(subplebbit.title);
                    setSelectedAddress(subplebbit.address);
                  }}
                  >{subplebbit.title ? subplebbit.title : subplebbit.address}</Link>
                  ]&nbsp;
                </span>
              ))}
              <span className="nav">
                [
                <Link to={`/p/${selectedAddress}/settings`} onClick={() => setIsSettingsOpen(true)}>Settings</Link>
                ]
                [
                <Link to="/" onClick={() => handleStyleChange({target: {value: "Yotsuba"}}
                )}>Home</Link>
                ]
              </span>
            </>
          </NavBar>
          <div id="version">
            plebchan v{version}. GPL-2.0
          </div>
          <div className="footer-links"
            style={{
              textAlign: "center",
              fontSize: "x-small",
              fontFamily: "arial",
              marginTop: "5px",
              marginBottom: "15px",
            }}>
            <a style={{textDecoration: 'underline'}} href="https://plebbit.com" target="_blank" rel="noopener noreferrer">About</a>
            &nbsp;•&nbsp;  
            <a style={{textDecoration: 'underline'}} href="https://github.com/plebbit/plebchan/releases/latest" target="_blank" rel="noopener noreferrer">App</a>
            &nbsp;•&nbsp;
            <a style={{textDecoration: 'underline'}} href="https://twitter.com/plebchan_eth" target="_blank" rel="noopener noreferrer">Twitter</a>
            &nbsp;•&nbsp;  
            <a style={{textDecoration: 'underline'}} href="https://t.me/plebbit" target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
        </Footer>
      </Container>
    </>
  );
}

export default Board;