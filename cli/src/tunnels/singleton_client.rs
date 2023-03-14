/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	sync::{
		atomic::{AtomicBool, Ordering},
		Arc,
	},
	thread,
};

use tokio::sync::mpsc;

use crate::{
	async_pipe::{socket_stream_split, AsyncPipe},
	json_rpc::{new_json_rpc, start_json_rpc},
	log,
	tunnels::protocol::EmptyObject,
	util::sync::Barrier,
};

use super::{protocol, shutdown_signal::ShutdownSignal};

pub struct SingletonClientArgs {
	pub log: log::Logger,
	pub stream: AsyncPipe,
	pub shutdown: Barrier<ShutdownSignal>,
}

struct SingletonServerContext {
	log: log::Logger,
	exit_entirely: Arc<AtomicBool>,
}

/// Serves a client singleton. Returns true if the process should exit after
/// this returns, instead of trying to start a tunnel.
pub async fn start_singleton_client(args: SingletonClientArgs) -> bool {
	let mut rpc = new_json_rpc();
	let (msg_tx, msg_rx) = mpsc::unbounded_channel();
	let exit_entirely = Arc::new(AtomicBool::new(false));

	debug!(
		args.log,
		"An existing tunnel is running on this machine, connecting to it..."
	);

	let stdin_handle = rpc.get_caller(msg_tx);
	thread::spawn(move || {
		let term = console::Term::stderr();
		loop {
			match term.read_key() {
				Ok(console::Key::Char('x')) => {
					stdin_handle.notify("shutdown", EmptyObject {});
				}
				Ok(console::Key::Char('r')) => {
					stdin_handle.notify("restart", EmptyObject {});
				}
				Err(_) => return, // EOF or not a tty
				_ => {}
			}
		}
	});

	let mut rpc = rpc.methods(SingletonServerContext {
		log: args.log.clone(),
		exit_entirely: exit_entirely.clone(),
	});

	rpc.register_sync("shutdown", |_: EmptyObject, c| {
		c.exit_entirely.store(true, Ordering::SeqCst);
		Ok(())
	});

	rpc.register_sync("log", |log: protocol::singleton::LogMessageOwned, c| {
		match log.level {
			Some(level) => c.log.emit(level, &format!("{}{}", log.prefix, log.message)),
			None => c.log.result(format!("{}{}", log.prefix, log.message)),
		}
		Ok(())
	});

	let (read, write) = socket_stream_split(args.stream);
	let _ = start_json_rpc(rpc.build(args.log), read, write, msg_rx, args.shutdown).await;

	exit_entirely.load(Ordering::SeqCst)
}
