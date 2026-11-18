import React, { createRef } from "react";
import { useCallback, useRef, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, View, Text, Dimensions } from 'react-native'
import { Camera, getCameraDevice } from 'react-native-vision-camera'
import { CONTENT_SPACING, CONTROL_BUTTON_SIZE, SAFE_AREA_PADDING } from './Constants'
import IonIcon from 'react-native-vector-icons/Ionicons'
import { WebView } from 'react-native-webview';
import { enableSleepPrevention, disableSleepPrevention } from './sleepPrevention';

import RNOrientationDirector, { Orientation } from 'react-native-orientation-director';
RNOrientationDirector.lockTo(Orientation.portrait);

import Svg, {
  Path, Circle, Rect
} from 'react-native-svg';

var lastCode;

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

var minx=133;
var miny=74;
var maxx=500;
var maxy=424;

const scalex = (x) => {
	return (((x-maxx)/(minx-maxx))*1000);
}
const scaley = (y) => {
	return (((y-miny)/(maxy-miny))*1000);
}

const codesWeHave = {};

export class CodeScannerPage extends React.Component {
	
	constructor(props) {
		super(props);

		const device = getCameraDevice(Camera.getAvailableCameraDevices(), 'back');
		console.log(JSON.stringify(device, null, 2));

		this.state = {
			path:'',
			torch:false,
			setupCycle:0,
			isActive: device != null,
			device,
		};
			
		this.webRef = createRef(null);
	}

	componentDidMount() {
		enableSleepPrevention('code-scanner');
	}

	componentWillUnmount() {
		disableSleepPrevention('code-scanner');
	}
	

	onCodeScanned = (codes) => {
			
		//console.log(codes[0].corners[0]);
		
		const value = codes[0]?.value
		if (value == null) return
	
		const paths = [];
		let mindiff = 99999;
		let minidx = 0;
		for(let i = 0;i < codes.length;i++)
		{
			const diff = Math.abs(scalex(codes[i].frame.x + (codes[i].frame.width/2))-500)+
				Math.abs(scaley(codes[i].frame.y + (codes[i].frame.height/2))-250);
			if(diff < mindiff) {
				mindiff = diff;
				minidx = i;
			};
		  
		}
		for(let i = 0;i < codes.length;i++)
		{
			const path = 
				"M "+scalex(codes[i].corners[0].y)+" "+scaley(codes[i].corners[0].x)+" "+
				"L "+scalex(codes[i].corners[1].y)+" "+scaley(codes[i].corners[1].x)+" "+
				"L "+scalex(codes[i].corners[2].y)+" "+scaley(codes[i].corners[2].x)+" "+
				"L "+scalex(codes[i].corners[3].y)+" "+scaley(codes[i].corners[3].x)+" "+
				"L "+scalex(codes[i].corners[0].y)+" "+scaley(codes[i].corners[0].x)+" Z";
			
			if(minidx == i){
				paths.push(<Path d={path} fill="none" key={'item_'+i} stroke={codesWeHave[codes[i].value]?'green':'red'} strokeWidth="10"/>);
			}else{
				paths.push(<Path d={path} fill="none" key={'item_'+i} stroke="blue" strokeWidth="10"/>);
			}
		  
		}

		if(this.state.setupCycle==1){
			paths.push(<Path d="M 110 10 L 10 10 L 10 110" fill="none" key={'item_'+codes.length} stroke="yellow" strokeWidth="15"/>);
			maxx = codes[minidx].corners[0].y;
			if( codes[minidx].corners[1].y > maxx) maxx = codes[minidx].corners[1].y;
			if( codes[minidx].corners[2].y > maxx) maxx = codes[minidx].corners[2].y;
			if( codes[minidx].corners[3].y > maxx) maxx = codes[minidx].corners[3].y;
			miny = codes[minidx].corners[0].x;
			if( codes[minidx].corners[1].x < miny) miny = codes[minidx].corners[1].x;
			if( codes[minidx].corners[2].x < miny) miny = codes[minidx].corners[2].x;
			if( codes[minidx].corners[3].x < miny) miny = codes[minidx].corners[3].x;
		}
		else if(this.state.setupCycle==2){
			paths.push(<Path d="M 890 990 L 990 990 L 990 890" fill="none" key={'item_'+codes.length+1} stroke="yellow" strokeWidth="15"/>);
			minx = codes[minidx].corners[0].y;
			if( codes[minidx].corners[1].y < minx) minx = codes[minidx].corners[1].y;
			if( codes[minidx].corners[2].y < minx) minx = codes[minidx].corners[2].y;
			if( codes[minidx].corners[3].y < minx) minx = codes[minidx].corners[3].y;
			maxy = codes[minidx].corners[0].x;
			if( codes[minidx].corners[1].x > maxy) maxy = codes[minidx].corners[1].x;
			if( codes[minidx].corners[2].x > maxy) maxy = codes[minidx].corners[2].x;
			if( codes[minidx].corners[3].x > maxy) maxy = codes[minidx].corners[3].x;
		}
		
		this.setState({path:paths});
		
		if(this.webRef && this.webRef.current){
			if(lastCode != codes[minidx].value){
				this.webRef.current.injectJavaScript('window.scanned("'+codes[minidx].value+'")');
				this.webRef.current.injectJavaScript('window.scanned2("")');
				this.webRef.current.injectJavaScript('window.scanned3("")');
				this.webRef.current.injectJavaScript('window.scanned4("")');
				lastCode = codes[0].value;
			}
		}
  	}

	render() {
		return (
			<>
				<View style={styles.container}>
		  			{this.state.device != null && (
						<Camera
							style={StyleSheet.absoluteFill}
			  				enableZoomGesture={true}
			  				onOutputOrientationChanged={()=>{}/*(ori)=>{console.log('ori',ori,Dimensions.get('window').width)}*/}
			  				onPreviewOrientationChanged={()=>{}/*(ori)=>{console.log('ori2',ori,Dimensions.get('window').width)}*/}
			  				onUIRotationChanged={()=>{}/*(ori)=>{console.log('ori3',ori,Dimensions.get('window').width)}*/}
			  				device={this.state.device}
							codeScanner={{codeTypes:['code-128','ean-8','ean-13'],onCodeScanned:this.onCodeScanned}}
			  				isActive={this.state.isActive}
			  				torch={this.state.torch ? 'on' : 'off'}
						/>
		  			)}
				</View>
			  	<View style={{position: 'absolute', left: 0, width:250, top: 0, height:250}}>
					<WebView 
						source={{ uri: '' }}
						bounces={false}
						ref={this.webRef}
						overScrollMode={'never'}
						cacheEnabled={false}
						startInLoadingState={false}
						useWebView2={true}
						mixedContentMode={'always'}
						androidHardwareAccelerationDisabled={true}
						originWhitelist={['*']}
						incognito={false}
						onLoadStart={(event) => {
						}}
						onMessage={(event)=> {
							console.log('onMEssage',event.nativeEvent.data);
						}}
						onShouldStartLoadWithRequest={(event) => {
							return true;
						}}
					/>
			  	</View>
			  	<View pointerEvents="none" style={[StyleSheet.absoluteFill,{ alignItems: 'center', justifyContent: 'center' }]}>
					<Svg height="100%" width="100%" viewBox="0 0 1000 1000">
						<>{this.state.path}</>
					</Svg>
			  	</View>
				<View style={styles.rightButtonRow}>
					<Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => {this.setState({torch:!this.state.torch})}}>
						<IonIcon name={this.state.torch ? 'flash' : 'flash-off'} color="white" size={24} />
					</Pressable>
				</View>
				<View style={styles.rightButtonRowBottom}>
					<Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => { this.setState({setupCycle:this.state.setupCycle==2?0:this.state.setupCycle+1});}}>
						<IonIcon name={(this.state.setupCycle == 0)?'cog-outline':'crop-outline'} color="white" size={24} />
					</Pressable>
				</View>
			</>
  		)
	}
}
		  
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  button: {
    marginBottom: CONTENT_SPACING,
    width: CONTROL_BUTTON_SIZE,
    height: CONTROL_BUTTON_SIZE,
    borderRadius: CONTROL_BUTTON_SIZE / 2,
    backgroundColor: 'rgba(140, 140, 140, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.4,
  },
  rightButtonRow: {
    position: 'absolute',
    right: SAFE_AREA_PADDING.paddingRight,
    top: SAFE_AREA_PADDING.paddingTop,
  },
  rightButtonRowBottom: {
    position: 'absolute',
    right: SAFE_AREA_PADDING.paddingRight,
    bottom: SAFE_AREA_PADDING.paddingTop,
  },
  canvas: {
    position: 'absolute',
	flex:1,
    right: SAFE_AREA_PADDING.paddingLeft,
    top: SAFE_AREA_PADDING.paddingTop
  },
  backButton: {
    position: 'absolute',
    left: SAFE_AREA_PADDING.paddingLeft,
    top: SAFE_AREA_PADDING.paddingTop,
  },
})
