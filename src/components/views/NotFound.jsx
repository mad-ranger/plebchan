import React, { useEffect, useRef }  from 'react';
import { Helmet } from 'react-helmet-async';
import useGeneralStore from '../../hooks/stores/useGeneralStore';
import { Link } from "react-router-dom";
import { Container, Header, Logo, Page, Boards, BoardsTitle } from '../styled/views/Home.styled';
import packageJson from '../../../package.json'
const {version} = packageJson


const NotFound = () => {
  const { 
    bodyStyle, setBodyStyle,
    selectedStyle, setSelectedStyle,
  } = useGeneralStore(state => state);

  const prevStyle = useRef(selectedStyle);
  const prevBodyStyle = useRef(bodyStyle);

  // prevent dark mode
  useEffect(() => {
    const currentPrevStyle = prevStyle.current;
    const currentPrevBodyStyle = prevBodyStyle.current;

    setBodyStyle({
      background: "#ffe url(assets/fade.png) top repeat-x",
      color: "maroon",
      fontFamily: "Helvetica, Arial, sans-serif"
    });
    setSelectedStyle("Yotsuba");

    return () => {
      setSelectedStyle(currentPrevStyle);
      setBodyStyle(currentPrevBodyStyle);
    };
  }, [setBodyStyle, setSelectedStyle]);

  return (
    <>
      <Helmet>
        <title>plebchan - 404 Not Found</title>
      </Helmet>
      <Container>
        <Header>
          <Logo>
            <Link to="/">
              <img alt="plebchan" src="assets/logo/logo-transparent.png" />
            </Link>
          </Logo>
        </Header>
        <Page>
          <Boards>
            <BoardsTitle>
              <h2 style={{textAlign: 'center'}}>404 Not Found</h2>
            </BoardsTitle>
            <img src="assets/plebchan-husbando.jpg" alt="plebchan" style={{
              display: "block",
              margin: "auto",
              padding: "15px", 
              width: "50%"
              }}></img>
          </Boards>
        </Page>
        <div style={{
          textAlign: "center",
          fontSize: "11px",
          marginTop: "2em",
        }}>
          plebchan v{version}. GPL-2.0
        </div>
      </Container>
    </>
  );
}

export default NotFound;