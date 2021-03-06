import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Selection, IColumn } from '@fluentui/react'
import { get } from 'lodash'

import { runCommand } from '@/utils/fetcher'
import { stringify } from '@/utils/ejson'
import { MongoData, DisplayMode } from '@/types'
import { useCommandFind } from '@/hooks/use-command'
import { usePromise } from '@/hooks/use-promise'
import { calcHeaders, mapToColumn } from '@/utils/table'
import { Table } from './Table'
import { EditorModal } from './EditorModal'
import { DocumentContextualMenu } from './DocumentContextualMenu'
import { PromiseButton } from './PromiseButton'
import { LargeMessage } from './LargeMessage'
import { MongoDataColorized } from './MongoDataColorized'
import { DocumentCell } from './DocumentCell'

type Document = { [key: string]: MongoData }

export function DocumentsList() {
  const displayMode = useSelector((state) => state.docs.displayMode)
  const connection = useSelector((state) => state.root.connection)
  const database = useSelector((state) => state.root.database)
  const collection = useSelector((state) => state.root.collection)
  const index = useSelector((state) => state.docs.index)
  const { data, error, revalidate } = useCommandFind()
  const [isUpdateOpen, setIsUpdateOpen] = useState(false)
  const [isMenuHidden, setIsMenuHidden] = useState(true)
  const [invokedItem, setInvokedItem] = useState<Document>()
  const [editedItem, setEditedItem] = useState<Document>()
  const handleUpdate = useCallback(
    async () =>
      database && collection
        ? runCommand(connection, database, {
            findAndModify: collection,
            query: { _id: (invokedItem as { _id: unknown })._id },
            update: editedItem,
          })
        : undefined,
    [connection, database, collection, invokedItem, editedItem],
  )
  const promiseUpdate = usePromise(handleUpdate)
  useEffect(() => {
    if (promiseUpdate.resolved) {
      revalidate()
      setIsUpdateOpen(false)
    }
  }, [promiseUpdate.resolved, revalidate])
  const target = useRef<MouseEvent>()
  const selection = useMemo(() => new Selection<Document>(), [])
  const title = useMemo(() => stringify(invokedItem?._id), [invokedItem])
  const onItemInvoked = useCallback((item: Document) => {
    setInvokedItem(item)
    setEditedItem(item)
    setIsUpdateOpen(true)
  }, [])
  const onItemContextMenu = useCallback(
    (ev: MouseEvent) => {
      if (selection.getSelectedCount() === 1) {
        const [item] = selection.getSelection()
        setInvokedItem(item)
      } else {
        setInvokedItem(undefined)
      }
      target.current = ev
      setIsMenuHidden(false)
    },
    [selection],
  )
  const order = useMemo(
    () => [
      '_id',
      ...Object.keys(index?.key || {}).map((key) => key.split('.')[0]),
      ...Object.keys(index?.weights || {}).map((key) => key.split('.')[0]),
    ],
    [index],
  )
  const index2dsphere = useMemo(
    () =>
      index?.['2dsphereIndexVersion']
        ? Object.entries(index.key).find(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ([_key, value]) => value === '2dsphere',
          )?.[0]
        : undefined,
    [index],
  )
  const handleRenderItemColumn = useCallback(
    (item?: Document, _index?: number, column?: IColumn) =>
      displayMode === DisplayMode.DOCUMENT ? (
        <MongoDataColorized value={item} />
      ) : (
        <DocumentCell
          value={item?.[column?.key as keyof typeof item]}
          subStringLength={
            // eslint-disable-next-line no-bitwise
            column?.currentWidth ? undefined : column?.minWidth! >> 2
          }
          index2dsphere={
            index2dsphere &&
            column?.key &&
            index2dsphere.startsWith(column?.key)
              ? get(item, index2dsphere)
              : undefined
          }
        />
      ),
    [index2dsphere, displayMode],
  )
  useEffect(() => {
    selection.setAllSelected(false)
  }, [selection, data])
  const columns = useMemo<IColumn[]>(() => {
    if (!data || data.cursor.firstBatch.length === 0) {
      return []
    }
    return displayMode === DisplayMode.TABLE
      ? mapToColumn(calcHeaders(data.cursor.firstBatch, order))
      : [
          {
            key: '',
            name: 'Documents',
            minWidth: 0,
            isMultiline: true,
          },
        ]
  }, [displayMode, data, order])
  const handleGetKey = useCallback((item: Document, i?: number) => {
    return item._id ? JSON.stringify(item._id) : JSON.stringify(item) + i
  }, [])

  if (error) {
    return (
      <LargeMessage iconName="Error" title="Error" content={error.message} />
    )
  }
  if (!data) {
    return <LargeMessage iconName="HourGlass" title="Loading" />
  }
  return (
    <>
      <EditorModal<Document>
        title={title ? `View Document: ${title}` : 'View Document'}
        value={editedItem}
        onChange={setEditedItem}
        isOpen={isUpdateOpen}
        onDismiss={() => {
          setIsUpdateOpen(false)
        }}
        onDismissed={() => {
          setEditedItem(invokedItem)
        }}
        footer={
          <PromiseButton
            text="Update"
            primary={true}
            promise={promiseUpdate}
            style={{ flexShrink: 0 }}
          />
        }
      />
      <DocumentContextualMenu
        hidden={isMenuHidden}
        onDismiss={() => {
          setIsMenuHidden(true)
        }}
        target={target.current}
        selectedItems={selection.getSelection()}
        onEdit={
          invokedItem
            ? () => {
                setIsMenuHidden(true)
                setIsUpdateOpen(true)
              }
            : undefined
        }
      />
      <Table
        items={data.cursor.firstBatch}
        columns={columns}
        getKey={handleGetKey}
        onItemInvoked={onItemInvoked}
        onItemContextMenu={onItemContextMenu}
        selection={selection}
        onRenderItemColumn={handleRenderItemColumn}
      />
    </>
  )
}
