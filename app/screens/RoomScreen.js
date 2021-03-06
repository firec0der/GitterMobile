import React, {
  Component,
  PropTypes,
  InteractionManager,
  DrawerLayoutAndroid,
  ToolbarAndroid,
  ToastAndroid,
  Clipboard,
  Alert,
  ListView,
  View
} from 'react-native'
import {connect} from 'react-redux'
import moment from 'moment'
import BottomSheet from '../../libs/react-native-android-bottom-sheet'
import DialogAndroid from 'react-native-dialogs'
import _ from 'lodash'
import s from '../styles/screens/Room/RoomStyles'
import {THEMES} from '../constants'
const {colors} = THEMES.gitterDefault
import {quoteLink} from '../utils/links'

import {
  getRoom,
  selectRoom,
  joinRoom,
  changeFavoriteStatus,
  leaveRoom,
  markAllAsRead,
  getNotificationSettings,
  changeNotificationSettings
} from '../modules/rooms'
import {
  getRoomMessages,
  prepareListView,
  getRoomMessagesBefore,
  getRoomMessagesIfNeeded,
  sendMessage,
  resendMessage,
  updateMessage,
  deleteFailedMessage,
  clearError as clearMessagesError,
  readMessages
} from '../modules/messages'
import {changeRoomInfoDrawerState} from '../modules/ui'
import * as Navigation from '../modules/navigation'

import RoomInfoScreen from './RoomInfoScreen'

import Loading from '../components/Loading'
import MessagesList from '../components/Room/MessagesList'
import SendMessageField from '../components/Room/SendMessageField'
import JoinRoomField from '../components/Room/JoinRoomField'
import LoadingMoreSnack from '../components/LoadingMoreSnack'
import FailedToLoad from '../components/FailedToLoad'

class Room extends Component {
  constructor(props) {
    super(props)
    this.roomInfoDrawer = null
    this.readMessages = {}

    this.renderToolbar = this.renderToolbar.bind(this)
    this.renderListView = this.renderListView.bind(this)
    this.prepareDataSources = this.prepareDataSources.bind(this)
    this.onEndReached = this.onEndReached.bind(this)
    this.onSending = this.onSending.bind(this)
    this.onJoinRoom = this.onJoinRoom.bind(this)
    this.onMessageLongPress = this.onMessageLongPress.bind(this)
    this.onTextFieldChange = this.onTextFieldChange.bind(this)
    this.onRetryFetchingMessages = this.onRetryFetchingMessages.bind(this)
    this.handleToolbarActionSelected = this.handleToolbarActionSelected.bind(this)
    this.handleCopyToClipboard = this.handleCopyToClipboard.bind(this)
    this.handleUsernamePress = this.handleUsernamePress.bind(this)
    this.handleUserAvatarPress = this.handleUserAvatarPress.bind(this)
    this.renderRoomInfo = this.renderRoomInfo.bind(this)
    this.handleDialogPress = this.handleDialogPress.bind(this)
    this.handleQuotePress = this.handleQuotePress.bind(this)
    this.handleQuoteWithLinkPress = this.handleQuoteWithLinkPress.bind(this)
    this.onMessagePress = this.onMessagePress.bind(this)
    this.onResendingMessage = this.onResendingMessage.bind(this)
    this.handleChangeVisibleRows = this.handleChangeVisibleRows.bind(this)
    this.handleReadMessages = _.debounce(this.handleReadMessages.bind(this), 250)
    this.handleNotificationSettingsChange = this.handleNotificationSettingsChange.bind(this)

    this.state = {
      textInputValue: '',
      editing: false,
      editMessage: {}
    }
  }

  componentDidMount() {
    this.prepareDataSources()
    const {activeRoom, rooms, route: { roomId }, dispatch, listViewData} = this.props
    // dispatch(subscribeToChatMessages(roomId))
    dispatch(changeRoomInfoDrawerState('close'))
    InteractionManager.runAfterInteractions(() => {
      dispatch(clearMessagesError())
      if (activeRoom !== roomId) {
        dispatch(selectRoom(roomId))
      }
      if (!rooms[roomId]) {
        dispatch(getRoom(roomId))
      }
      dispatch(getNotificationSettings(roomId))
      if (!listViewData[roomId]) {
        dispatch(getRoomMessages(roomId))
      } else {
        dispatch(getRoomMessagesIfNeeded(roomId))
      }
    })
  }

  onEndReached() {
    const {dispatch, route: {roomId}, hasNoMore, isLoadingMore, isLoadingMessages, listViewData} = this.props
    if (hasNoMore[roomId] !== true && isLoadingMore === false
        && isLoadingMessages === false && listViewData[roomId].data.length !== 0) {
      dispatch(getRoomMessagesBefore(roomId))
    }
  }

  onSending() {
    const {dispatch, route: {roomId}} = this.props
    if (this.state.editing) {
      this.onEndEdit()
    } else {
      dispatch(sendMessage(roomId, this.state.textInputValue))
      this.setState({textInputValue: ''})
    }
  }

  onResendingMessage(rowId, text) {
    const {dispatch, route: {roomId}} = this.props
    dispatch(resendMessage(roomId, rowId, text))
  }

  onJoinRoom() {
    const {dispatch, route: {roomId}} = this.props
    Alert.alert(
      'Join room',
      'Are you sure?',
      [
        {text: 'Cancel', onPress: () => console.log('Cancel Pressed!')}, // eslint-disable-line no-console
        {text: 'OK', onPress: () => dispatch(joinRoom(roomId))}
      ]
    )
  }

  onMessagePress(id, rowId, messageText, failed) {
    const {currentUser, entities} = this.props
    const message = entities[id]
    let options

    if (failed) {
      options = {
        title: messageText,
        items: [
          'Retry',
          'Copy text',
          'Delete'
        ]
      }
    } else {
      options = {
        title: !!message.editedAt && !message.text ? 'This message was deleted' : message.text,
        items: [
          'Copy text',
          'Reply',
          'Quote',
          'Quote with link'
        ]
      }
      const experied = moment(message.sent).add(5, 'm')
      if (currentUser.username === message.fromUser.username &&
        moment().isBefore(experied) && !!message.text) {
        options.items.push('Edit', 'Delete')
      }
    }

    // TODO: Use BottomSheet/ActionSheet instead of Alert
    BottomSheet.showBotttomSheetWithOptions(options, (index, itemText) =>
      this.handleDialogPress(index, itemText, message, rowId, id, failed, messageText))
  }

  onMessageLongPress(messageId) {
    const {dispatch, route: {roomId}} = this.props
    dispatch(Navigation.goTo({name: 'message', messageId, roomId}))
  }

  onDelete(rowId, id) {
    const {dispatch, route: {roomId}, entities} = this.props
    const message = entities[id]
    const experied = moment(message.sent).add(5, 'm')

    if (moment().isAfter(experied)) {
      ToastAndroid.show("Can't delete message.", ToastAndroid.SHORT)
      return false
    }

    const text = ''
    dispatch(updateMessage(roomId, id, text))
  }

  onDeleteFailedMsg(rowId) {
    const {dispatch, route: {roomId}} = this.props
    dispatch(deleteFailedMessage(rowId, roomId))
  }

  onEdit(rowId, id) {
    const {entities} = this.props
    const message = entities[id]
    const experied = moment(message.sent).add(5, 'm')

    if (moment().isAfter(experied)) {
      this.setState({editing: false})
      return false
    }

    this.setState({
      textInputValue: message.text,
      editing: true,
      editMessage: {
        rowId, id
      }
    })

    // triggers two times because sometimes it won't focus
    setTimeout(() => this.refs.sendMessageField.focus(), 200)
  }

  onEndEdit() {
    const {dispatch, route: {roomId}, entities} = this.props
    const {textInputValue, editMessage: {id, rowId}} = this.state
    const message = entities[id]
    const experied = moment(message.sent).add(5, 'm')

    if (moment().isAfter(experied)) {
      this.setState({
        editing: false,
        textInputValue: '',
        editMessage: {}
      })
      this.refs.sendMessageField.blur()
      ToastAndroid.show("Can't edit message.", ToastAndroid.SHORT)
      return false
    }

    dispatch(updateMessage(roomId, id, textInputValue, rowId))
    this.refs.sendMessageField.blur()
    this.setState({
      editing: false,
      editMessage: {},
      textInputValue: ''
    })
  }

  onTextFieldChange(text) {
    this.setState({textInputValue: text})
  }

  onRetryFetchingMessages() {
    const {dispatch, route: {roomId}} = this.props
    dispatch(clearMessagesError())
    dispatch(getRoomMessages(roomId))
  }

  handleDialogPress(index, text, message, rowId, id, failed, messageText) {
    switch (text) {
    case 'Copy text':
      if (failed) {
        this.handleCopyToClipboard(messageText)
      } else {
        this.handleCopyToClipboard(message.text)
      }
      break
    case 'Edit':
      this.onEdit(rowId, id)
      break
    case 'Delete':
      if (failed) {
        this.onDeleteFailedMsg(rowId)
      } else {
        this.onDelete(rowId, id)
      }
      break
    case 'Quote':
      this.handleQuotePress(message)
      break
    case 'Quote with link':
      this.handleQuoteWithLinkPress(message)
      break
    case 'Reply':
      this.handleUsernamePress(message.fromUser.username)
      break
    case 'Retry':
      this.onResendingMessage(rowId, messageText)
      break
    default:
      break
    }
  }

  handleToolbarActionSelected(index) {
    const {dispatch, route: {roomId}} = this.props
    if (index === 0) {
      return this.roomInfoDrawer.openDrawer()
    }
    if (index === 1) {
      return dispatch(changeFavoriteStatus(roomId))
    }
    if (index === 2) {
      return dispatch(markAllAsRead(roomId))
    }
    if (index === 3) {
      return this.handleNotificationSettingsChange()
    }
    if (index === 4) {
      return this.leaveRoom()
    }
  }

  handleCopyToClipboard(text) {
    Clipboard.setString(text)
    ToastAndroid.show('Copied', ToastAndroid.SHORT)
  }

  handleUsernamePress(username) {
    const {textInputValue} = this.state
    this.setState({
      textInputValue: !!textInputValue ? `${textInputValue} @${username} ` : `@${username} `
    })
    this.refs.sendMessageField.focus()
  }

  handleUserAvatarPress(id, username) {
    const {dispatch} = this.props
    dispatch(Navigation.goTo({name: 'user', userId: id, username}))
  }

  handleQuotePress(message) {
    const {textInputValue} = this.state
    this.setState({
      textInputValue: !!textInputValue ? `${textInputValue}\n> ${message.text}\n\n ` : `> ${message.text}\n\n `
    })
    this.refs.sendMessageField.focus()
  }

  handleQuoteWithLinkPress(message) {
    const {rooms, route} = this.props
    const room = rooms[route.roomId]
    const time = moment(message.sent).format('YYYY MMM D, HH:mm')
    const link = quoteLink(time, room.url, message.id)
    const {textInputValue} = this.state
    this.setState({
      textInputValue: !!textInputValue ? `${textInputValue}\n${link} ` : `${link} `
    })
    this.refs.sendMessageField.focus()
  }

  handleChangeVisibleRows(visibleRows, changedRows) {
    const {dispatch, route: {roomId}} = this.props
    console.log('VISIBLE', visibleRows)
    console.log('CHANGED', changedRows)

    this.readMessages = Object.assign({}, this.readMessages, changedRows.s1)

    this.handleReadMessages()
  }

  handleReadMessages() {
    const {dispatch, route: {roomId}} = this.props
    if (!Object.keys(this.readMessages).length) {
      return
    }
    dispatch(readMessages(roomId, this.readMessages))

    this.readMessages = {}
  }

  handleNotificationSettingsChange() {
    const {dispatch, route: {roomId}, notifications} = this.props
    const roomNotif = notifications[roomId]

    if (!roomNotif) {
      return
    }

    const items = [
      'All: Notify me for all messages',
      'Announcements: Notify for mentions and announcements',
      "Mute: Notify me only when I'm directly mentioned"
    ]

    const selectedIndex = roomNotif.mode === 'all' ? 0 : roomNotif.mode === 'announcement' ? 1 : 2

    const dialog = new DialogAndroid()

    const options = {
      title: 'Notifications setting',
      items,
      positiveText: 'Change',
      negativeText: 'Cancle',
      selectedIndex,
      itemsCallbackSingleChoice: (index, text) => dispatch(changeNotificationSettings(roomId, index))
    }

    dialog.set(options)
    dialog.show()
  }

  leaveRoom() {
    const {dispatch, route: {roomId}} = this.props
    Alert.alert(
      'Leave room',
      'Are you sure?',
      [
        {text: 'Cancel', onPress: () => {}},
        {text: 'OK', onPress: () => dispatch(leaveRoom(roomId))}
      ]
    )
  }

  prepareDataSources() {
    const {listViewData, route: {roomId}, dispatch} = this.props
    if (!listViewData[roomId]) {
      const ds = new ListView.DataSource({rowHasChanged: (row1, row2) => {
        return row1 !== row2
        //   return true
        // } else if (r1.text === r2.text) {
        //   return false
        // } else {
          // return true
        // }
      }})
      dispatch(prepareListView(roomId, ds.cloneWithRows([])))
    }
  }

  renderToolbar() {
    const {rooms, route} = this.props
    const room = rooms[route.roomId]
    let actions = []

    // TODO: Update one action instead
    if (!!room && room.roomMember) {
      if (room.hasOwnProperty('favourite')) {
        actions = [{
          title: 'Open room info',
          icon: require('image!ic_info_outline_white_24dp'),
          show: 'never'
        },
        {
          title: 'Remove from favorite',
          show: 'never'
        },
        {
          title: 'Mark all as read',
          show: 'never'
        },
        {
          title: 'Change notification settings',
          show: 'never'
        },
        {
          title: 'Leave room',
          show: 'never'
        }]
      } else {
        actions = [{
          title: 'Open room info',
          icon: require('image!ic_info_outline_white_24dp'),
          show: 'never'
        },
        {
          title: 'Add to favorite',
          show: 'never'
        },
        {
          title: 'Mark all as read',
          show: 'never'
        },
        {
          title: 'Change notification settings',
          show: 'never'
        },
        {
          title: 'Leave room',
          show: 'never'
        }]
      }
    }

    return (
      <ToolbarAndroid
        navIcon={require('image!ic_menu_white_24dp')}
        onIconClicked={this.props.onMenuTap}
        actions={actions}
        onActionSelected={this.handleToolbarActionSelected}
        overflowIcon={require('image!ic_more_vert_white_24dp')}
        title={!!room ? room.name : ''}
        titleColor="white"
        style={s.toolbar} />
    )
  }

  renderBottom() {
    const {rooms, route: {roomId}} = this.props
    if (!rooms[roomId].roomMember) {
      return (
        <JoinRoomField
          onPress={this.onJoinRoom.bind(this)} />
      )
    }
    return (
      <SendMessageField
        ref="sendMessageField"
        onSending={this.onSending.bind(this)}
        onChange={this.onTextFieldChange.bind(this)}
        value={this.state.textInputValue} />
    )
  }

  renderLoadingMore() {
    return (
      <LoadingMoreSnack loading/>
    )
  }

  renderLoading() {
    return (
      <Loading color={colors.raspberry}/>
    )
  }

  renderListView() {
    const {listViewData, dispatch, route: {roomId}, getMessagesError} = this.props
    if (getMessagesError) {
      return (
        <FailedToLoad
          message="Failed to load messages."
          onRetry={this.onRetryFetchingMessages.bind(this)} />
      )
    }
    return (
      <MessagesList
        onChangeVisibleRows={this.handleChangeVisibleRows}
        listViewData={listViewData[roomId]}
        onPress={this.onMessagePress.bind(this)}
        onLongPress={this.onMessageLongPress.bind(this)}
        onUsernamePress={this.handleUsernamePress.bind(this)}
        onUserAvatarPress={this.handleUserAvatarPress.bind(this)}
        dispatch={dispatch}
        onEndReached={this.onEndReached.bind(this)} />
    )
  }

  renderRoomInfo() {
    const {route} = this.props
    return (
      <RoomInfoScreen
        route={route}
        drawer={this.roomInfoDrawer} />
    )
  }

  render() {
    const {rooms, listViewData, route, isLoadingMessages,
      isLoadingMore, getMessagesError, dispatch} = this.props

    if (getMessagesError && !rooms[route.roomId]) {
      return (
        <FailedToLoad
          message="Failed to load room."
          onPress={this.componentDidMount.bind(this)} />
      )
    }

    if (!rooms[route.roomId]) {
      return (
        <View style={s.container}>
          {this.renderToolbar()}
          {this.renderLoading()}
        </View>
      )
    }

    const listView = listViewData[route.roomId]

    return (
      <View style={s.container}>
        <DrawerLayoutAndroid
          ref={component => this.roomInfoDrawer = component}
          style={{backgroundColor: 'white'}}
          drawerWidth={300}
          onDrawerOpen={() => dispatch(changeRoomInfoDrawerState('open'))}
          onDrawerClose={() => dispatch(changeRoomInfoDrawerState('close'))}
          drawerPosition={DrawerLayoutAndroid.positions.Right}
          renderNavigationView={this.renderRoomInfo}
          keyboardDismissMode="on-drag">
            {this.renderToolbar()}
            {isLoadingMore ? this.renderLoadingMore() : null}
            {isLoadingMessages ? this.renderLoading() : this.renderListView()}
            {getMessagesError || isLoadingMessages || _.has(listView, 'data') &&
              listView.data.length === 0 ? null : this.renderBottom()}
          </DrawerLayoutAndroid>
      </View>
    )
  }
}

Room.propTypes = {
  activeRoom: PropTypes.string,
  rooms: PropTypes.object,
  onMenuTap: PropTypes.func,
  route: PropTypes.object,
  dispatch: PropTypes.func,
  isLoadingMessages: PropTypes.bool,
  isLoadingMore: PropTypes.bool,
  listViewData: PropTypes.object,
  byRoom: PropTypes.object,
  entities: PropTypes.object,
  hasNoMore: PropTypes.object,
  currentUser: PropTypes.object,
  getMessagesError: PropTypes.bool,
  roomInfoDrawerState: PropTypes.string,
  notifications: PropTypes.object
}

function mapStateToProps(state) {
  const {listView, isLoading, isLoadingMore, byRoom, hasNoMore, entities} = state.messages
  const {activeRoom, rooms, notifications} = state.rooms
  const {roomInfoDrawerState} = state.ui
  return {
    activeRoom,
    rooms,
    entities,
    getMessagesError: state.messages.error,
    listViewData: listView,
    isLoadingMessages: isLoading,
    isLoadingMore,
    byRoom,
    hasNoMore,
    currentUser: state.viewer.user,
    roomInfoDrawerState,
    notifications
  }
}

export default connect(mapStateToProps)(Room)
