import React, { Component } from 'react';
import { debounce } from 'lodash';
import { SCREENSHOT_INTERACTION_MODE, INTERACTION_MODE, APP_MODE } from './shared';
import { Card, Button, Spin, Tooltip, Modal, Tabs } from 'antd';
import Screenshot from './Screenshot';
import SelectedElement from './SelectedElement';
import Source from './Source';
import InspectorStyles from './Inspector.css';
import RecordedActions from './RecordedActions';
import Actions from './Actions';
import SessionInfo from './SessionInfo';
import { clipboard } from '../../polyfills';
import {
  SelectOutlined,
  ScanOutlined,
  SwapRightOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  EyeOutlined,
  PauseOutlined,
  SearchOutlined,
  CopyOutlined,
  DownloadOutlined,
  CloseOutlined,
  FileTextOutlined,
  TagOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { BUTTON } from '../../../../gui-common/components/AntdTypes';

const {SELECT, SWIPE, TAP} = SCREENSHOT_INTERACTION_MODE;

const { TabPane } = Tabs;

const ButtonGroup = Button.Group;

const MIN_WIDTH = 1080;
const MIN_HEIGHT = 570;
const MAX_SCREENSHOT_WIDTH = 500;

const MJPEG_STREAM_CHECK_INTERVAL = 1000;

function downloadXML (sourceXML) {
  let element = document.createElement('a');
  element.setAttribute('href', 'data:application/xml;charset=utf-8,' + encodeURIComponent(sourceXML));
  element.setAttribute('download', 'source.xml');

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

export default class Inspector extends Component {

  constructor () {
    super();
    this.didInitialResize = false;
    this.state = {
      scaleRatio: 1,
    };
    this.screenAndSourceEl = null;
    this.lastScreenshot = null;
    this.screenshotEl = null;
    this.updateSourceTreeWidth = debounce(this.updateSourceTreeWidth.bind(this), 50);
    this.updateScaleRatio = debounce(this.updateScaleRatio.bind(this), 500);
    this.mjpegStreamCheckInterval = null;
  }

  /**
   * Calculates the ratio that the image is being scaled by
   */
  updateScaleRatio () {
    const screenshotImg = this.screenshotEl.querySelector('img');

    // now update scale ratio
    this.setState({
      scaleRatio: (this.props.windowSize.width / screenshotImg.offsetWidth)
    });
  }

  updateSourceTreeWidth () {
    // the idea here is to keep track of the screenshot image width. if it has
    // too much space to the right or bottom, adjust the max-width of the
    // screenshot container so the source tree flex adjusts to always fill the
    // remaining space. This keeps everything looking tight.
    if (!this.screenAndSourceEl) {
      return;
    }

    const screenshotBox = this.screenAndSourceEl.querySelector('#screenshotContainer');
    const img = this.screenAndSourceEl.querySelector('#screenshotContainer img#screenshot');

    if (!img) {
      return;
    }

    const imgRect = img.getBoundingClientRect();
    const screenshotRect = screenshotBox.getBoundingClientRect();
    screenshotBox.style.flexBasis = `${imgRect.width}px`;
    if (imgRect.height < screenshotRect.height) {
      // get what the img width would be if it fills screenshot box height
      const attemptedWidth = (screenshotRect.height / imgRect.height) * imgRect.width;
      screenshotBox.style.maxWidth = attemptedWidth > MAX_SCREENSHOT_WIDTH ?
        `${MAX_SCREENSHOT_WIDTH}px` :
        `${attemptedWidth}px`;
    } else if (imgRect.width < screenshotRect.width) {
      screenshotBox.style.maxWidth = `${imgRect.width}px`;
    }

    this.updateScaleRatio();
  }

  componentDidMount () {
    const curHeight = window.innerHeight;
    const curWidth = window.innerWidth;
    const needsResize = (curHeight < MIN_HEIGHT) || (curWidth < MIN_WIDTH);
    if (!this.didInitialResize && needsResize) {
      const newWidth = curWidth < MIN_WIDTH ? MIN_WIDTH : curWidth;
      const newHeight = curHeight < MIN_HEIGHT ? MIN_HEIGHT : curHeight;
      // resize width to something sensible for using the inspector on first run
      window.resizeTo(newWidth, newHeight);
    }
    this.didInitialResize = true;
    this.props.applyClientMethod({methodName: 'getPageSource', ignoreResult: true});
    this.props.getSavedActionFramework();
    this.props.runKeepAliveLoop();
    window.addEventListener('resize', this.updateSourceTreeWidth);
    this.props.setSessionTime(Date.now());

    if (this.props.mjpegScreenshotUrl) {
      this.mjpegStreamCheckInterval = setInterval(this.checkMjpegStream.bind(this),
        MJPEG_STREAM_CHECK_INTERVAL);
    }
  }

  async checkMjpegStream () {
    const {mjpegScreenshotUrl, isAwaitingMjpegStream, setAwaitingMjpegStream} = this.props;
    const img = new Image();
    img.src = mjpegScreenshotUrl;
    let imgReady = false;
    try {
      await img.decode();
      imgReady = true;
    } catch (ign) {}
    if (imgReady && isAwaitingMjpegStream) {
      setAwaitingMjpegStream(false);
      this.updateSourceTreeWidth();
    } else if (!imgReady && !isAwaitingMjpegStream) {
      setAwaitingMjpegStream(true);
    }
  }

  componentDidUpdate () {
    const {screenshot} = this.props;
    // only update when the screenshot changed, not for any other kind of
    // update
    if (screenshot !== this.lastScreenshot) {
      this.updateSourceTreeWidth();
      this.lastScreenshot = screenshot;
    }
  }

  componentWillUnmount () {
    if (this.mjpegStreamCheckInterval) {
      clearInterval(this.mjpegStreamCheckInterval);
      this.mjpegStreamCheckInterval = null;
    }
  }

  screenshotInteractionChange (mode) {
    const {selectScreenshotInteractionMode, clearSwipeAction} = this.props;
    clearSwipeAction(); // When the action changes, reset the swipe action
    selectScreenshotInteractionMode(mode);
  }

  render () {
    const {screenshot, screenshotError, selectedElement = {},
           applyClientMethod, quitSession, isRecording, showRecord, startRecording,
           pauseRecording, showLocatorTestModal, appMode,
           screenshotInteractionMode, isFindingElementsTimes, visibleCommandMethod,
           selectedInteractionMode, selectInteractionMode, selectAppMode, setVisibleCommandResult,
           showKeepAlivePrompt, keepSessionAlive, sourceXML, t, visibleCommandResult,
           mjpegScreenshotUrl, isAwaitingMjpegStream} = this.props;
    const {path} = selectedElement;

    const showScreenshot = ((screenshot && !screenshotError) ||
                            (mjpegScreenshotUrl && !isAwaitingMjpegStream));

    let main = <div className={InspectorStyles['inspector-main']} ref={(el) => {this.screenAndSourceEl = el;}}>
      <div id='screenshotContainer' className={InspectorStyles['screenshot-container']} ref={(el) => {this.screenshotEl = el;}}>
        {showScreenshot && <Screenshot {...this.props} scaleRatio={this.state.scaleRatio}/>}
        {screenshotError && t('couldNotObtainScreenshot', {screenshotError})}
        {!showScreenshot &&
          <Spin size="large" spinning={true}>
            <div className={InspectorStyles.screenshotBox} />
          </Spin>
        }
      </div>
      <div id='sourceTreeContainer' className={InspectorStyles['interaction-tab-container']} >
        {showRecord &&
          <RecordedActions {...this.props} />
        }
        <Tabs activeKey={selectedInteractionMode}
          size="small"
          onChange={(tab) => selectInteractionMode(tab)}>
          <TabPane tab={t('Source')} key={INTERACTION_MODE.SOURCE}>
            <div className='action-row'>
              <div className='action-col'>
                <Card title={<span><FileTextOutlined /> {t('App Source')} </span>}
                  extra={
                    <span>
                      <Tooltip title={t('Copy XML Source to Clipboard')}>
                        <Button type='text' id='btnSourceXML' icon={<CopyOutlined/>} onClick={() => clipboard.writeText(sourceXML)} />
                      </Tooltip>
                      <Tooltip title={t('Download Source as .XML File')}>
                        <Button type='text' id='btnDownloadSourceXML' icon={<DownloadOutlined/>} onClick={() => downloadXML(sourceXML)}/>
                      </Tooltip>
                    </span>
                  }>
                  <Source {...this.props} />
                </Card>
              </div>
              <div id='selectedElementContainer'
                className={`${InspectorStyles['interaction-tab-container']} ${InspectorStyles['element-detail-container']} action-col`}>
                <Card title={<span><TagOutlined /> {t('selectedElement')}</span>}
                  className={InspectorStyles['selected-element-card']}>
                  {path && <SelectedElement {...this.props}/>}
                  {!path && <i>{t('selectElementInSource')}</i>}
                </Card>
              </div>
            </div>
          </TabPane>
          <TabPane tab={t('Actions')} key={INTERACTION_MODE.ACTIONS}>
            <Card
              title={<span><ThunderboltOutlined /> {t('Actions')}</span>}
              className={InspectorStyles['interaction-tab-card']}>
              <Actions {...this.props} />
            </Card>
          </TabPane>
          <TabPane tab={t('Session Information')} key={INTERACTION_MODE.SESSION_INFO}>
            <Card
              title={<span><InfoCircleOutlined /> {t('Session Information')}</span>}
              className={InspectorStyles['interaction-tab-card']}>
              <SessionInfo {...this.props} />
            </Card>
          </TabPane>
        </Tabs>
      </div>
    </div>;

    const appModeControls = <div className={InspectorStyles['action-controls']}>
      <ButtonGroup value={appMode}>
        <Tooltip title={t('Native App Mode')}>
          <Button icon={<AppstoreOutlined/>} onClick={() => {selectAppMode(APP_MODE.NATIVE);}}
            type={appMode === APP_MODE.NATIVE ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          />
        </Tooltip>
        <Tooltip title={t('Web/Hybrid App Mode')}>
          <Button icon={<GlobalOutlined/>} onClick={() => {selectAppMode(APP_MODE.WEB_HYBRID);}}
            type={appMode === APP_MODE.WEB_HYBRID ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          />
        </Tooltip>
      </ButtonGroup>
    </div>;

    let actionControls = <div className={InspectorStyles['action-controls']}>
      <ButtonGroup value={screenshotInteractionMode}>
        <Tooltip title={t('Select Elements')}>
          <Button icon={<SelectOutlined/>} onClick={() => {this.screenshotInteractionChange(SELECT);}}
            type={screenshotInteractionMode === SELECT ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          />
        </Tooltip>
        <Tooltip title={t('Swipe By Coordinates')}>
          <Button icon={<SwapRightOutlined/>} onClick={() => {this.screenshotInteractionChange(SWIPE);}}
            type={screenshotInteractionMode === SWIPE ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          />
        </Tooltip>
        <Tooltip title={t('Tap By Coordinates')}>
          <Button icon={<ScanOutlined/>} onClick={() => {this.screenshotInteractionChange(TAP);}}
            type={screenshotInteractionMode === TAP ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          />
        </Tooltip>
      </ButtonGroup>
    </div>;

    const generalControls = <ButtonGroup>
      <Tooltip title={t('Back')}>
        <Button id='btnGoBack' icon={<ArrowLeftOutlined/>} onClick={() => applyClientMethod({methodName: 'back'})}/>
      </Tooltip>
      <Tooltip title={t('refreshSource')}>
        <Button id='btnReload' icon={<ReloadOutlined/>} onClick={() => applyClientMethod({methodName: 'getPageSource'})}/>
      </Tooltip>
      {!isRecording &&
        <Tooltip title={t('Start Recording')}>
          <Button id='btnStartRecording' icon={<EyeOutlined/>} onClick={startRecording}/>
        </Tooltip>
      }
      {isRecording &&
        <Tooltip title={t('Pause Recording')}>
          <Button id='btnPause' icon={<PauseOutlined/>} type={BUTTON.DANGER} onClick={pauseRecording}/>
        </Tooltip>
      }
      <Tooltip title={t('Search for element')}>
        <Button id='searchForElement' icon={<SearchOutlined/>} onClick={showLocatorTestModal}/>
      </Tooltip>
      <Tooltip title={t('quitSessionAndClose')}>
        <Button id='btnClose' icon={<CloseOutlined/>} onClick={() => quitSession()}/>
      </Tooltip>
    </ButtonGroup>;

    let controls = <div className={InspectorStyles['inspector-toolbar']}>
      {appModeControls}
      {actionControls}
      {generalControls}
    </div>;

    return (<Spin spinning={isFindingElementsTimes} key="main">
      <div className={InspectorStyles['inspector-container']}>
        {controls}
        {main}
        <Modal
          title={t('Session Inactive')}
          visible={showKeepAlivePrompt}
          onOk={() => keepSessionAlive()}
          onCancel={() => quitSession()}
          okText={t('Keep Session Running')}
          cancelText={t('Quit Session')}
        >
          <p>{t('Your session is about to expire')}</p>
        </Modal>
        <Modal
          title={t('methodCallResult', {methodName: visibleCommandMethod})}
          visible={!!visibleCommandResult}
          onOk={() => setVisibleCommandResult(null)}
          onCancel={() => setVisibleCommandResult(null)}
        >
          <pre><code>{visibleCommandResult}</code></pre>
        </Modal>
      </div>
    </Spin>);
  }
}
