import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  Space,
  Typography,
  Popconfirm,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import client from '../api/client';

const { Title } = Typography;

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, object = edit
  const [form] = Form.useForm();

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/settings');
      // Response can be array or { items: [...] }
      const items = Array.isArray(res.data) ? res.data : res.data.items || [];
      setSettings(items);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      key: record.key,
      value: record.value,
      note: record.note,
      is_active: record.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        // Update
        await client.put(`/settings/${editing.key}`, {
          value: values.value,
          note: values.note,
          is_active: values.is_active,
        });
        message.success('\u8bbe\u7f6e\u5df2\u66f4\u65b0');
      } else {
        // Create
        await client.post('/settings', {
          key: values.key,
          value: values.value,
          note: values.note,
        });
        message.success('\u8bbe\u7f6e\u5df2\u521b\u5efa');
      }
      setModalOpen(false);
      fetchSettings();
    } catch (err) {
      if (err.response?.status === 409) {
        message.error('Key \u5df2\u5b58\u5728');
      } else if (err.errorFields) {
        // form validation error, ignore
      } else {
        message.error('\u64cd\u4f5c\u5931\u8d25');
      }
    }
  };

  const handleDelete = async (key) => {
    try {
      await client.delete(`/settings/${key}`);
      message.success('\u8bbe\u7f6e\u5df2\u5220\u9664');
      fetchSettings();
    } catch {
      message.error('\u5220\u9664\u5931\u8d25');
    }
  };

  const columns = [
    { title: 'Key', dataIndex: 'key', key: 'key' },
    { title: 'Value', dataIndex: 'value', key: 'value', ellipsis: true },
    { title: '\u5907\u6ce8', dataIndex: 'note', key: 'note', ellipsis: true },
    {
      title: '\u72b6\u6001',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v) => (
        <Tag color={v ? 'green' : 'default'}>
          {v ? '\u542f\u7528' : '\u7981\u7528'}
        </Tag>
      ),
    },
    {
      title: '\u66f4\u65b0\u65f6\u95f4',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (t) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '\u64cd\u4f5c',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            {'\u7f16\u8f91'}
          </Button>
          <Popconfirm
            title={'\u786e\u8ba4\u5220\u9664\u8be5\u8bbe\u7f6e\uff1f'}
            onConfirm={() => handleDelete(record.key)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              {'\u5220\u9664'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Title level={4}>{'\u7cfb\u7edf\u8bbe\u7f6e'}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {'\u65b0\u589e\u8bbe\u7f6e'}
        </Button>
      </Space>
      <Table
        columns={columns}
        dataSource={settings}
        rowKey="key"
        loading={loading}
        pagination={false}
      />
      <Modal
        title={editing ? '\u7f16\u8f91\u8bbe\u7f6e' : '\u65b0\u589e\u8bbe\u7f6e'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="key"
            label="Key"
            rules={[{ required: true, message: '\u8bf7\u8f93\u5165 Key' }]}
          >
            <Input disabled={!!editing} placeholder="feature_flag_x" />
          </Form.Item>
          <Form.Item
            name="value"
            label="Value"
            rules={[{ required: true, message: '\u8bf7\u8f93\u5165 Value' }]}
          >
            <Input placeholder="true" />
          </Form.Item>
          <Form.Item name="note" label={'\u5907\u6ce8'}>
            <Input.TextArea rows={2} />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label={'\u542f\u7528'} valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  );
}
